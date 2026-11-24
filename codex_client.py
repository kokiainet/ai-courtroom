"""A real local Codex CLI decision worker, using its existing login."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


def find_codex(settings=None):
    candidates = [
        (settings or {}).get('codex_path'),
        shutil.which('codex'),
        '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
        '/Applications/Codex.app/Contents/Resources/codex',
    ]
    return next((str(p) for p in candidates if p and Path(p).is_file() and os.access(str(p), os.X_OK)), None)


class CodexClient:
    def __init__(self, settings):
        self.settings = settings
        self.last_receipt = None
        self.binary = find_codex(settings)

    def complete(self, system, messages):
        from adapters import IntegrationError, _extract_action
        if not self.binary:
            raise IntegrationError('codex', 'not_installed', 'Codex CLI could not be found on this computer.')
        root = Path(__file__).resolve().parent / 'runtime' / 'codex'
        root.mkdir(parents=True, exist_ok=True)
        keys = ('agent', 'kind', 'text', 'decision', 'why', 'research_query', 'outcome')
        properties = {key: {'type': 'string'} for key in keys}
        properties['evidence_ids'] = {'type': 'array', 'items': {'type': 'string'}}
        schema = {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}
        prompt = ('You are a bounded decision worker for a fictional courtroom short. '
                  'Use only the context below. Do not inspect files, run tools, browse, edit code, '
                  'or act as a coding assistant. Return only the final JSON action requested by '
                  'the schema. research_query and outcome are empty strings when not applicable. '
                  'Give concise public reasons, not private reasoning.\n\nROLE INSTRUCTIONS:\n' + system +
                  '\n\nROLE CONVERSATION:\n' + json.dumps(messages, ensure_ascii=False))
        with tempfile.TemporaryDirectory(prefix='decision-', dir=str(root)) as temporary:
            workspace = Path(temporary)
            schema_file = workspace / 'action-schema.json'
            output_file = workspace / 'action.json'
            schema_file.write_text(json.dumps(schema))
            command = [self.binary, '--no-daemon', '-a', 'never', 'exec', '--ignore-user-config',
                       '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check',
                       '--color', 'never', '--json', '--output-schema', str(schema_file),
                       '--output-last-message', str(output_file), '-C', str(workspace), '-']
            model = str(self.settings.get('codex_model') or '').strip()
            if model:
                command[command.index('exec') + 1:command.index('exec') + 1] = ['--model', model]
            start = time.monotonic()
            try:
                result = subprocess.run(command, input=prompt, capture_output=True, text=True,
                                        timeout=90, cwd=str(workspace))
            except subprocess.TimeoutExpired:
                raise IntegrationError('codex', 'timeout', 'The Codex decision worker exceeded its 90-second limit.') from None
            events = []
            for line in result.stdout.splitlines():
                try:
                    event = json.loads(line)
                    if isinstance(event, dict):
                        events.append(event)
                except ValueError:
                    pass
            if result.returncode != 0 or not output_file.is_file():
                error = next((e.get('error', {}).get('message') for e in reversed(events)
                              if e.get('type') == 'turn.failed' and isinstance(e.get('error'), dict)), None)
                # Do not return raw stderr: auth and local diagnostics stay local.
                message = 'Codex CLI could not produce a decision. Check its login, model access and network.'
                if error:
                    message += ' ' + str(error)[:300]
                raise IntegrationError('codex', 'execution_failed', message)
            raw = output_file.read_text()
            action = _extract_action(raw)
            usage = next((e.get('usage') for e in reversed(events) if e.get('type') == 'turn.completed'), None)
            thread_id = next((e.get('thread_id') for e in events if e.get('type') == 'thread.started'), None)
            unexpected_tools = [e.get('item', {}).get('type') for e in events
                                if e.get('type') == 'item.started' and e.get('item', {}).get('type') in
                                ('command_execution', 'mcp_tool_call', 'web_search', 'file_change')]
            if unexpected_tools:
                raise IntegrationError('codex', 'unexpected_tool', 'The decision worker attempted an out-of-scope tool operation. Its action was not accepted.')
            receipt = {'service': 'codex_cli', 'provider': 'codex', 'model': model or 'CLI default',
                       'thread_id': thread_id, 'exit_code': result.returncode,
                       'latency_ms': round((time.monotonic() - start) * 1000),
                       'response_sha256': hashlib.sha256(raw.encode()).hexdigest(),
                       'usage': usage, 'verified': True, 'sandbox': 'read-only', 'ephemeral': True}
            self.last_receipt = receipt
            action['model_receipt'] = receipt
            return action

    decide = complete

    def probe(self):
        self.complete('You are judge, a connection test. Return kind procedure, text "The courtroom decision worker is connected.", decision "Connection verified", why "A real Codex CLI inference completed", evidence_ids [], research_query "", outcome "".',
                      [{'role': 'user', 'content': 'Return the requested connection-test JSON.'}])
        return {'service': 'codex', 'ok': True, 'connected': True, 'receipt': self.last_receipt}
