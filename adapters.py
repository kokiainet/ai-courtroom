"""Real service adapters. Python 3.9 standard library; no credentials from env.

Credentials are supplied by the localhost server's settings object. Never log
settings, request headers, or upstream error bodies. No fallback manufactures a
model decision or a sponsor receipt.
"""
import hashlib
import json
import re
import socket
import time
import uuid
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class IntegrationError(RuntimeError):
    def __init__(self, service, code, message):
        self.service = service
        self.code = str(code)
        self.message = message
        super().__init__(message)

    def as_dict(self):
        return {"service": self.service, "code": self.code, "message": self.message}


class _NoRedirect(HTTPRedirectHandler):
    # Never forward an Authorization / X-API-Key header to another host.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _now():
    return datetime.now(timezone.utc).isoformat()


def _url(value, service, allow_query=False):
    value = str(value or "").strip().rstrip("/")
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "https" or
                 (parsed.scheme == "http" and parsed.hostname in
                  ("localhost", "127.0.0.1", "::1")))
        if not valid or not parsed.hostname or parsed.username or parsed.password or (parsed.query and not allow_query) or parsed.fragment:
            raise ValueError()
        return value
    except (ValueError, TypeError):
        raise IntegrationError(service, "invalid_url", "Use an HTTPS API base URL, without credentials, query parameters or a fragment. HTTP is allowed only on localhost.")


def _request(service, url, headers, payload=None, timeout=30):
    """Return JSON + receipt. Upstream response bodies never enter errors."""
    url = _url(url, service, allow_query=True)
    start = time.monotonic()
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request_headers = {"Accept": "application/json", "User-Agent": "AI-Courtroom/1.0"}
    request_headers.update(headers)
    if data is not None:
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=request_headers,
                      method="GET" if payload is None else "POST")
    try:
        with build_opener(_NoRedirect()).open(request, timeout=min(30, timeout)) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise IntegrationError(service, "response_too_large", "The service response exceeded the local size limit.")
            try:
                result = json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeError):
                raise IntegrationError(service, "invalid_response", "The service returned a non-JSON response.")
            if not isinstance(result, dict):
                raise IntegrationError(service, "invalid_response", "Expected a JSON object from the service.")
            receipt = {
                "service": service, "endpoint": url, "method": request.get_method(),
                "http_status": response.status, "timestamp": _now(),
                "latency_ms": round((time.monotonic() - start) * 1000),
                "response_sha256": hashlib.sha256(raw).hexdigest(),
                "request_id": response.headers.get("x-request-id") or response.headers.get("request-id"),
                "verified": True,
            }
            return result, receipt
    except HTTPError as exc:
        code = exc.code
        messages = {
            400: "The API rejected this request. Check the endpoint, model and supported parameters.",
            401: "Authentication failed. Check the API key in local setup.",
            402: "This service requires available credit or billing setup.",
            403: "The key or plan does not permit this operation.",
            404: "The endpoint, model, agent or room could not be found or accessed.",
            408: "The service timed out. Try again when it is available.",
            422: "The service rejected the request parameters.",
            429: "Rate limit or credit limit reached. Check the service console before retrying.",
        }
        message = messages.get(code, "The upstream service returned HTTP %s." % code)
        raise IntegrationError(service, code, message) from None
    except (socket.timeout, TimeoutError):
        raise IntegrationError(service, "timeout", "The service did not respond within 30 seconds.") from None
    except (URLError, OSError):
        raise IntegrationError(service, "connection_error", "Could not connect securely to the service. Check the API URL and network.") from None


def _extract_action(text):
    if not isinstance(text, str) or not text.strip():
        raise IntegrationError("model", "empty_response", "The model returned no text. Check its output token budget and model compatibility.")
    clean = text.strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.I)
        clean = re.sub(r"\s*```$", "", clean)
    try:
        result = json.loads(clean)
    except ValueError:
        raise IntegrationError("model", "invalid_action_json", "The model did not return a valid JSON action. No substitute decision was generated.") from None
    if isinstance(result, dict) and isinstance(result.get("action"), dict):
        result = result["action"]
    if not isinstance(result, dict):
        raise IntegrationError("model", "invalid_action", "The model action must be a JSON object.")
    # The controller owns the actor identity and can add it after validation.
    for field in ("kind", "text", "decision", "why"):
        if not isinstance(result.get(field), str) or not result[field].strip():
            raise IntegrationError("model", "invalid_action", "The model action is missing the required '%s' text field." % field)
    ids = result.get("evidence_ids")
    if not isinstance(ids, list) or any(not isinstance(item, str) for item in ids):
        raise IntegrationError("model", "invalid_action", "The model must return evidence_ids as an array of strings.")
    return result


class ModelClient:
    def __init__(self, settings):
        self.settings = settings
        self.last_receipt = None

    def decide(self, system, messages):
        self.last_receipt = None
        provider = str(self.settings.get("provider") or "").lower()
        if provider == "codex":
            from codex_client import CodexClient
            client = CodexClient(self.settings)
            result = client.complete(system, messages)
            self.last_receipt = getattr(client, "last_receipt", None) or result.get("model_receipt")
            return result
        model = str(self.settings.get("model") or "").strip()
        key = str(self.settings.get("api_key") or "").strip()
        if provider not in ("openai", "openai-compatible", "anthropic") or not model or not key or not self.settings.get("base_url"):
            raise IntegrationError("model", "not_configured", "Configure provider, API base URL, exact model name and API key in local setup.")
        base = _url(self.settings.get("base_url"), "model")
        if not isinstance(messages, list) or not messages:
            raise IntegrationError("model", "invalid_messages", "At least one input message is required.")
        cleaned = []
        for message in messages:
            if not isinstance(message, dict) or message.get("role") not in ("user", "assistant") or not isinstance(message.get("content"), str):
                raise IntegrationError("model", "invalid_messages", "Messages must contain user/assistant roles and text content.")
            cleaned.append({"role": message["role"], "content": message["content"]})
        instruction = (str(system) + "\nReturn only one JSON object, no Markdown. Required fields: "
                       'agent, kind, text, decision, why (strings), evidence_ids (array of strings). '
                       "Keep the spoken text and public reason concise. Do not invent sources or tool receipts.")
        if provider == "anthropic":
            endpoint = base if base.endswith("/messages") else base + ("/messages" if base.endswith("/v1") else "/v1/messages")
            headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
            body = {"model": model, "system": instruction, "messages": cleaned, "max_tokens": 600}
            response, receipt = _request("model", endpoint, headers, body)
            blocks = response.get("content", [])
            text = "".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
        else:
            host = urlsplit(base).hostname
            suffix = "/v1/chat/completions" if host == "api.openai.com" and not urlsplit(base).path.strip("/") else "/chat/completions"
            endpoint = base if base.endswith("/chat/completions") else base + suffix
            body = {"model": model, "messages": [{"role": "system", "content": instruction}] + cleaned,
                    "response_format": {"type": "json_object"}}
            if host == "api.deepseek.com":
                # DeepSeek enables reasoning by default; this short public-action
                # endpoint explicitly requests non-thinking mode.
                body["thinking"] = {"type": "disabled"}
            # Official OpenAI now uses max_completion_tokens; many compatible APIs use max_tokens.
            token_field = "max_completion_tokens" if urlsplit(base).hostname == "api.openai.com" else "max_tokens"
            body[token_field] = 600
            response, receipt = _request("model", endpoint, {"Authorization": "Bearer " + key}, body)
            choices = response.get("choices")
            if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                raise IntegrationError("model", "invalid_response", "The API returned no chat completion choices.")
            text = choices[0].get("message", {}).get("content")
            if isinstance(text, list):
                text = "".join(b.get("text", "") for b in text if isinstance(b, dict) and b.get("type") == "text")
        action = _extract_action(text)
        receipt.update({"provider": provider, "model": model, "response_id": response.get("id"),
                        "usage": response.get("usage")})
        self.last_receipt = receipt
        action["model_receipt"] = receipt
        return action

    complete = decide

    def probe(self):
        if str(self.settings.get("provider") or "").lower() == "codex":
            from codex_client import CodexClient
            return CodexClient(self.settings).probe()
        self.decide("You are a connectivity probe, agent judge. Return kind probe, a short test text, decision 'probe', why 'API connectivity check', and empty evidence_ids.",
                    [{"role": "user", "content": "Return the required JSON action."}])
        return {"service": "model", "ok": True, "connected": True, "receipt": self.last_receipt}


class TelemClient:
    BASE_URL = "https://router.telem.ai/v1"

    def __init__(self, settings):
        self.settings = settings
        self.receipts = []
        self.session_id = None

    def _call(self, operation, payload):
        key = str(self.settings.get("telem_api_key") or "").strip()
        if not key:
            raise IntegrationError("telem", "not_configured", "Add a Telem API key in local setup to retrieve public references.")
        payload = dict(payload)
        if self.session_id:
            payload["session_id"] = self.session_id
        response, receipt = _request("telem", self.BASE_URL + "/" + operation,
                                     {"Authorization": "Bearer " + key}, payload)
        self.session_id = response.get("session_id") or self.session_id
        receipt.update({"operation": operation, "session_id": response.get("session_id"),
                        "interaction_id": response.get("interaction_id"), "status": response.get("status")})
        self.receipts.append(receipt)
        return response, receipt

    def search(self, query, limit=3):
        query = str(query).strip()
        if not query:
            raise IntegrationError("telem", "invalid_query", "Enter a non-empty research query.")
        response, receipt = self._call("search", {"user_input": {"query": query[:400]},
            "search": {"auto_routing": "accuracy", "tier": "default", "num_results": max(1, min(int(limit), 5))}})
        results = []
        # HTTP API keeps each upstream provider in preprocessor_runs.
        for run in response.get("preprocessor_runs", []):
            if not isinstance(run, dict):
                continue
            for item in (run.get("output_payload") or {}).get("results", []):
                if isinstance(item, dict):
                    result = dict(item)
                    result["provider"] = run.get("preprocessor_name")
                    results.append(result)
        if not results and isinstance(response.get("results"), list):
            results = [dict(item) for item in response["results"] if isinstance(item, dict)]
        unique = []
        seen = set()
        for result in results:
            url = str(result.get("url") or "")
            if url.startswith(("https://", "http://")) and url.split("#")[0] not in seen:
                seen.add(url.split("#")[0])
                unique.append(result)
        if not unique:
            raise IntegrationError("telem", "no_results", "Telem returned no usable public URLs. No evidence was manufactured.")
        return {"results": unique[:limit], "receipt": receipt}

    def fetch(self, url):
        parsed = urlsplit(str(url))
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise IntegrationError("telem", "invalid_source_url", "Only public HTTP/HTTPS source URLs without credentials can be fetched.")
        response, receipt = self._call("fetch", {"urls": [url], "options": {"tier": "default"}})
        results = []
        # REST response differs from the SDK's normalized response.results.
        # https://docs.telem.ai/api/operations/create_fetch_v1_fetch_post/
        for run in response.get("preprocessor_runs", []):
            if not isinstance(run, dict) or not isinstance(run.get("output_payload"), dict):
                continue
            fetched = run["output_payload"].get("fetched_results")
            if isinstance(fetched, list):
                results.extend(page for page in fetched if isinstance(page, dict))
        if not results and isinstance(response.get("results"), list):
            results = response["results"]
        if not results or not isinstance(results[0], dict):
            raise IntegrationError("telem", "fetch_failed", "Telem returned no fetched page.")
        page = results[0]
        try:
            bad_http = page.get("http_status") is not None and int(page["http_status"]) >= 400
        except (TypeError, ValueError):
            bad_http = True
        if page.get("status") != "succeeded" or bad_http or not isinstance(page.get("content"), str) or not page["content"].strip():
            raise IntegrationError("telem", "fetch_failed", "Telem could not retrieve readable page content. The URL was not accepted as evidence.")
        receipt.update({"source_url": page.get("canonical_url") or url,
                        "provider": page.get("provider"), "content_sha256": page.get("content_sha256")})
        return {"url": page.get("canonical_url") or url, "title": page.get("title") or url,
                "content": page["content"], "receipt": receipt}

    def research(self, query):
        search = self.search(query, limit=3)
        evidence = []
        for result in search["results"]:
            url = result["url"]
            item = {"id": "ref-" + hashlib.sha256(url.encode()).hexdigest()[:10],
                    "title": result.get("title") or url, "url": url,
                    "text": result.get("summary") or result.get("excerpt") or "",
                    "type": "public_reference", "source_type": "public_reference",
                    "fictional": False, "label": "Public reference — not proof of fictional events",
                    "receipt": search["receipt"], "receipts": [search["receipt"]], "fetched": False}
            try:
                fetched = self.fetch(url)
                item.update({"text": fetched["content"][:10000], "title": fetched["title"],
                             "url": fetched["url"], "fetched": True})
                item["receipts"].append(fetched["receipt"])
            except IntegrationError as exc:
                item["fetch_error"] = exc.as_dict()
            if item["text"]:
                evidence.append(item)
        if not evidence:
            raise IntegrationError("telem", "no_readable_evidence", "No readable search excerpts or pages were returned.")
        return evidence

    def probe(self):
        result = self.search("site:copyright.gov copyright ideas expression", limit=1)
        return {"service": "telem", "ok": True, "connected": True,
                "result_count": len(result["results"]), "receipt": result["receipt"]}


class BandClient:
    BASE_URL = "https://api.band.ai/api/v1/agent"

    def __init__(self, settings):
        self.settings = settings
        config = settings.get("band_agents", settings.get("band_config", {}))
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except ValueError:
                config = {}
        self.agents = config if isinstance(config, dict) else {}
        self.room_id = str(settings.get("band_room_id") or "").strip()

    def status(self):
        configured = bool(self.agents) and all(isinstance(a, dict) and
            (a.get("id") or a.get("agent_id")) and a.get("api_key") for a in self.agents.values())
        return {"configured": bool(configured), "connected": False,
                "room_configured": bool(self.room_id), "roles": list(self.agents),
                "message": "Registered agent IDs and their own API keys are required. Identity probes do not establish room handoff."}

    def _agent(self, role):
        agent = self.agents.get(role)
        if not isinstance(agent, dict) or not (agent.get("id") or agent.get("agent_id")) or not agent.get("api_key"):
            raise IntegrationError("band", "not_configured", "Configure a registered BAND agent ID and its own API key for role '%s'." % role)
        return agent

    def _verify_received(self, message, expected_content, sender_id, recipient_id):
        """Validate identity, routing and the unchanged application envelope.

        BAND may normalize the rendered leading @mention. The metadata's
        registered recipient ID, rather than its display spelling, is the
        routing authority. The JSON application envelope must remain exact.
        """
        metadata = message.get("metadata") or {}
        mentions = metadata.get("mentions", []) if isinstance(metadata, dict) else []
        routed = any(isinstance(item, dict) and item.get("id") == recipient_id for item in mentions)
        if message.get("sender_id") != sender_id or not routed or message.get("chat_room_id", self.room_id) != self.room_id:
            raise IntegrationError("band", "handoff_mismatch", "The recipient's BAND message identity, room or routing did not match the sent handoff.")
        marker = "\nAI_COURTROOM_HANDOFF "
        received_text = message.get("content")
        if not isinstance(received_text, str) or marker not in received_text or marker not in expected_content:
            raise IntegrationError("band", "invalid_handoff", "BAND did not return the application handoff envelope.")
        actual_envelope = received_text.split(marker, 1)[1]
        if actual_envelope != expected_content.split(marker, 1)[1]:
            raise IntegrationError("band", "handoff_mismatch", "The application payload read from BAND differs from the sent handoff.")
        try:
            return json.loads(actual_envelope)
        except ValueError:
            raise IntegrationError("band", "invalid_handoff", "Could not decode the handoff returned by BAND.") from None

    def probe(self):
        if not self.status()["configured"]:
            raise IntegrationError("band", "not_configured", "Register the project agents in BAND and configure each agent ID and key locally.")
        verified = []
        for role in self.agents:
            agent = self._agent(role)
            result, receipt = _request("band", self.BASE_URL + "/me", {"X-API-Key": agent["api_key"]})
            identity = result.get("data") or {}
            expected = agent.get("id") or agent.get("agent_id")
            if identity.get("id") != expected:
                raise IntegrationError("band", "identity_mismatch", "The BAND key did not authenticate as the configured '%s' agent." % role)
            verified.append({"role": role, "agent_id": expected, "receipt": receipt})
        return {"service": "band", "ok": True, "identity_verified": True,
                "connected": False, "agents": verified,
                "message": "Agent identities verified. A real room handoff has not yet been performed."}

    def handoff(self, sender_role, recipient_role, payload):
        """Post to the configured project room, then read as the recipient.

        This is a real remote write when called. The local server must only call
        it for the user's registered project agents and designated project room.
        No room or participant is created or added here.
        """
        sender = self._agent(sender_role)
        recipient = self._agent(recipient_role)
        if not self.room_id:
            raise IntegrationError("band", "room_not_configured", "Configure an existing private BAND room containing the project agents.")
        if sender_role == recipient_role or not isinstance(payload, dict):
            raise IntegrationError("band", "invalid_handoff", "A handoff requires two different project roles and a JSON object payload.")
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        secret_values = [self.settings.get("api_key"), self.settings.get("telem_api_key")]
        secret_values += [a.get("api_key") for a in self.agents.values() if isinstance(a, dict)]
        if any(value and str(value) in serialized for value in secret_values):
            raise IntegrationError("band", "credential_in_payload", "Refusing to include a configured credential in a BAND handoff.")
        if len(serialized.encode("utf-8")) > 24000:
            raise IntegrationError("band", "payload_too_large", "The handoff exceeds the project message size limit.")
        sid = str(sender.get("id") or sender.get("agent_id"))
        rid = str(recipient.get("id") or recipient.get("agent_id"))
        if sid == rid:
            raise IntegrationError("band", "duplicate_identity", "Sender and recipient must be two distinct registered BAND agents.")
        receipts = []
        for configured, expected in ((sender, sid), (recipient, rid)):
            result, receipt = _request("band", self.BASE_URL + "/me", {"X-API-Key": configured["api_key"]})
            receipts.append(receipt)
            if (result.get("data") or {}).get("id") != expected:
                raise IntegrationError("band", "identity_mismatch", "A BAND credential does not match the configured agent ID.")
        room_path = self.BASE_URL + "/chats/" + quote(self.room_id, safe="")
        participants, receipt = _request("band", room_path + "/participants", {"X-API-Key": sender["api_key"]})
        receipts.append(receipt)
        people = {str(person.get("id")): person for person in participants.get("data", []) if isinstance(person, dict)}
        if sid not in people or rid not in people:
            raise IntegrationError("band", "participant_missing", "Both registered project agents must already be participants in the configured BAND room.")
        target = people[rid]
        handle = str(target.get("handle") or "").lstrip("@")
        if not handle:
            raise IntegrationError("band", "missing_handle", "BAND did not return the recipient's routing handle; no message was sent.")
        envelope = {"protocol": "ai-courtroom-handoff/1", "handoff_id": str(uuid.uuid4()),
                    "sender_role": sender_role, "recipient_role": recipient_role, "payload": payload}
        content = "@" + handle + "\nAI_COURTROOM_HANDOFF " + json.dumps(envelope, ensure_ascii=False, sort_keys=True)
        sent, receipt = _request("band", room_path + "/messages", {"X-API-Key": sender["api_key"]},
            {"message": {"content": content, "mentions": [{"id": rid, "handle": handle, "name": target.get("name") or recipient_role}]}})
        receipts.append(receipt)
        sent_data = sent.get("data") or {}
        message_id = sent_data.get("id")
        if not isinstance(message_id, str) or sent_data.get("success") is False:
            raise IntegrationError("band", "send_not_confirmed", "BAND did not confirm the handoff message. Do not retry blindly; inspect the project room.")
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            inbox, receipt = _request("band", room_path + "/messages?status=all&sort_order=desc&limit=100",
                                      {"X-API-Key": recipient["api_key"]}, timeout=max(1, deadline-time.monotonic()))
            receipts.append(receipt)
            for message in inbox.get("data", []):
                if not isinstance(message, dict) or message.get("id") != message_id:
                    continue
                received = self._verify_received(message, content, sid, rid)
                if received.get("handoff_id") != envelope["handoff_id"] or received.get("recipient_role") != recipient_role:
                    raise IntegrationError("band", "handoff_mismatch", "BAND returned a different handoff identity.")
                processing, processing_receipt = _request("band", room_path + "/messages/" + quote(message_id, safe="") + "/processing",
                    {"X-API-Key": recipient["api_key"]}, {})
                if (processing.get("data") or {}).get("success") is False:
                    raise IntegrationError("band", "processing_failed", "BAND refused to mark the received handoff as processing.")
                receipts.append(processing_receipt)
                return {"id": message_id, "service": "band", "verified": True, "connected": True,
                        "handoff_id": received["handoff_id"], "message_id": message_id,
                        "room_id": self.room_id, "sender_role": sender_role, "recipient_role": recipient_role,
                        "sender_agent_id": sid, "recipient_agent_id": rid,
                        "payload": received["payload"], "receipts": receipts,
                        "timestamp": _now(), "status": "processing"}
            time.sleep(0.5)
        raise IntegrationError("band", "delivery_timeout", "The handoff was sent but could not be read with the recipient's credential. Trial stopped; inspect the project room before retrying.")

    def complete_handoff(self, handoff):
        """Call only after the recipient's real model action succeeds."""
        if handoff.get("room_id") != self.room_id or not handoff.get("message_id"):
            raise IntegrationError("band", "invalid_handoff", "The completion does not belong to the configured project room.")
        recipient = self._agent(handoff.get("recipient_role"))
        path = self.BASE_URL + "/chats/" + quote(self.room_id, safe="") + "/messages/" + quote(handoff["message_id"], safe="") + "/processed"
        response, receipt = _request("band", path, {"X-API-Key": recipient["api_key"]}, {})
        if (response.get("data") or {}).get("success") is False:
            raise IntegrationError("band", "completion_failed", "BAND did not confirm the completed handoff.")
        return {"service": "band", "message_id": handoff["message_id"], "status": "processed", "receipt": receipt}


def integration_status(settings):
    provider = str(settings.get("provider") or "")
    configured = provider in ("openai", "openai-compatible", "anthropic") and all(
        bool(str(settings.get(key) or "").strip()) for key in ("base_url", "model", "api_key"))
    if provider == "codex":
        try:
            from codex_client import find_codex
            configured = bool(find_codex(settings))
        except (ImportError, OSError):
            configured = False
    return {"model_configured": bool(configured), "provider": provider,
            "model": str(settings.get("model") or ""),
            "telem": {"configured": bool(settings.get("telem_api_key")), "connected": False},
            "band": BandClient(settings).status()}
