"""Retry the authorized QA email once, recording provider status, never API keys."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services import email_service


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recipient', required=True)
    args = parser.parse_args()
    original = email_service.httpx.post
    attempts = []
    def observed(url, **kwargs):
        response = original(url, **kwargs)
        try:
            data = response.json()
        except ValueError:
            data = {}
        attempts.append({'provider': 'resend' if 'resend.com' in url else 'brevo',
                         'status': response.status_code, 'error_name': data.get('name') or data.get('code')})
        return response
    email_service.httpx.post = observed
    sent, provider, _, _ = email_service._send_email_via_smtp_or_resend(
        args.recipient, 'ConstructAi QA — email transport retry',
        '<p>This is the requested system email test retry. No account or payment action is required.</p>', '')
    result = {'accepted': sent, 'provider': provider, 'attempts': attempts}
    Path('.validation-db/email-provider-diagnostic.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
