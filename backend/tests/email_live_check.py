"""Send QA email only to the explicitly supplied recipient; no account creation.

Provider acceptance is not evidence of inbox receipt or successful link use.
"""
import argparse
import json
from pathlib import Path
import requests
from dotenv import dotenv_values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recipient', required=True)
    args = parser.parse_args()
    config = dotenv_values('backend/.env')
    state = json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))
    account = state['accounts']['super_admin']
    sb = config['SUPABASE_URL'].rstrip('/')
    key = config['SUPABASE_KEY']
    login = requests.post(sb + '/auth/v1/token?grant_type=password', headers={'apikey': key},
                          json={'email': account['email'], 'password': account['password']}, timeout=30)
    login.raise_for_status()
    headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
    result = {}
    health = requests.get('http://127.0.0.1:8000/api/notifications/email/health', headers=headers, timeout=30)
    result['email_health_status'] = health.status_code
    result['configured'] = health.json().get('configured') if health.status_code == 200 else False
    sent = requests.post('http://127.0.0.1:8000/api/notifications/email/send', headers=headers,
                         json={'to': args.recipient, 'subject': 'ConstructAi QA — email delivery test',
                               'html_body': '<h2>ConstructAi email test</h2><p>This is the system test email you requested. No payment or account change is required.</p>'}, timeout=90)
    result['notification_email_status'] = sent.status_code
    result['notification_email_accepted'] = sent.status_code == 200 and sent.json().get('success') is True
    # Only request recovery if a real profile exists, avoiding a false success
    # from Supabase's deliberate user-enumeration protection for unknown emails.
    profile = requests.get(sb + '/rest/v1/profiles', headers={'apikey': key, **headers},
                           params={'select': 'id', 'email': 'eq.' + args.recipient}, timeout=30)
    exists = profile.status_code == 200 and bool(profile.json())
    result['recipient_account_exists'] = exists
    if exists:
        redirect=(config.get('FRONTEND_URL') or 'http://localhost:8082').rstrip('/')+'/reset-password'
        recovery = requests.post('http://127.0.0.1:8000/api/auth/password-recovery',
                                 json={'email': args.recipient,'redirect_to':redirect}, timeout=45)
        result['recovery_status'] = recovery.status_code
        result['recovery_request_accepted'] = recovery.status_code == 202
    else:
        result['recovery_result'] = 'not_run_no_existing_profile'
    result['inbox_receipt_verified'] = False
    result['recovery_link_use_verified'] = False
    Path('.validation-db/email-live-results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
