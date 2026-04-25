import os
import re
import requests
from pathlib import Path

# Improved test: show response text when parsing fails to reveal API messages
def load_from_dotenv(path: Path):
    if not path.exists():
        return {}
    out = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        k, v = line.split('=', 1)
        out[k.strip()] = v.strip().strip('"\'')
    return out

# Prefer environment variables, then .env.local, then fall back to edamam.py
app_id = os.environ.get('EDAMAM_APP_ID')
app_key = os.environ.get('EDAMAM_APP_KEY')
if not (app_id and app_key):
    dotenv = Path(__file__).parent / '.env.local'
    envvals = load_from_dotenv(dotenv)
    app_id = app_id or envvals.get('EDAMAM_APP_ID')
    app_key = app_key or envvals.get('EDAMAM_APP_KEY')

if not (app_id and app_key):
    # Fallback to reading edamam.py (legacy)
    p = Path(__file__).parent / 'edamam.py'
    if not p.exists():
        print('edamam.py not found and no EDAMAM_APP_ID/KEY in environment or .env.local')
        raise SystemExit(1)
    text = p.read_text(encoding='utf-8')
    m_id = re.search(r'app_id\s*=\s*["\']([A-Za-z0-9_-]+)["\']', text)
    m_key = re.search(r'app_key\s*=\s*["\']([A-Za-z0-9_-]+)["\']', text)
    if not (m_id and m_key):
        print('Could not find app_id/app_key in edamam.py')
        raise SystemExit(1)
    app_id = m_id.group(1)
    app_key = m_key.group(1)

# Optional account user header required by some Edamam apps
account_user = os.environ.get('EDAMAM_ACCOUNT_USER') or envvals.get('EDAMAM_ACCOUNT_USER') if 'envvals' in locals() else os.environ.get('EDAMAM_ACCOUNT_USER')

q = 'margherita pizza'
# Use Edamam Recipe Search v2 endpoint with type=public
url = 'https://api.edamam.com/api/recipes/v2'
params = {'q': q, 'app_id': app_id, 'app_key': app_key, 'type': 'public', 'to': 5}
try:
    headers = {}
    if 'account_user' in locals() and account_user:
        headers['Edamam-Account-User'] = account_user
    r = requests.get(url, params=params, headers=headers or None, timeout=15)
except requests.RequestException as e:
    print('Network error while contacting Edamam:', e)
    print('Check your network connection and try again.')
else:
    print('HTTP', r.status_code)
    # If non-200, show friendly diagnostic info but do not raise an exception
    if r.status_code != 200:
        print('Edamam API did not return success. Status:', r.status_code)
        # Try to show helpful response info
        text = r.text.strip()
        json_msg = None
        try:
            j = r.json()
            json_msg = j.get('message') or j.get('error') or j.get('status')
        except Exception:
            j = None

        if text:
            print('\nResponse body preview:')
            print(text[:1000])

        if json_msg and 'Invalid User' in str(json_msg):
            print('\nDetected invalid Edamam user id in the `Edamam-Account-User` header:', account_user)
            print('This value appears to be rejected by Edamam. Common fixes:')
            print('- Use the numeric user id or user token provided by Edamam (not your email).')
            print('- Remove the `EDAMAM_ACCOUNT_USER` setting and try without the header.')
            # Try retrying without the header so we can see whether the API will respond without it
            if 'account_user' in locals() and account_user:
                print('\nRetrying request WITHOUT Edamam-Account-User header to compare results...')
                try:
                    r2 = requests.get(url, params=params, timeout=15)
                except requests.RequestException as e:
                    print('Network error during retry (no header):', e)
                else:
                    print('Retry HTTP', r2.status_code)
                    if r2.status_code == 200:
                        try:
                            data = r2.json()
                        except Exception:
                            print('Retry returned 200 but could not parse JSON. Raw response (truncated):')
                            print(repr(r2.text)[:1000])
                        else:
                            hits = data.get('hits', [])
                            print('Retry results:', len(hits))
                            for i, h in enumerate(hits[:3], start=1):
                                recipe = h.get('recipe', {})
                                print(f'- [retry {i}]', recipe.get('label'), '| image:', recipe.get('image'))
                        raise SystemExit(0)
                    else:
                        print('Retry without header also failed. Status:', r2.status_code)
                        print('Response preview:', r2.text[:1000])

        print('\nIf this is a 401 Unauthorized, your app_id/app_key may be invalid or not authorized for this endpoint.')
        print('Please verify credentials in edamam.py or supply valid keys in environment variables.')
        # Fallback: provide a small local sample so the app can continue working
        SAMPLE = [
            { 'label': 'Margherita Pizza', 'source': 'Local Sample', 'image': None },
            { 'label': 'Classic Pulao', 'source': 'Local Sample', 'image': None },
            { 'label': 'Herbed Fried Rice', 'source': 'Local Sample', 'image': None }
        ]
        print('\nUsing local sample recipes as a fallback:')
        for i, rcp in enumerate(SAMPLE, start=1):
            print(f'- [{i}]', rcp['label'], '| source:', rcp['source'])
    else:
        # 200 OK — attempt to parse JSON
        try:
            data = r.json()
        except Exception:
            print('Received 200 but could not parse JSON. Raw response (truncated):')
            print(repr(r.text)[:1000])
        else:
            hits = data.get('hits', [])
            print('Results:', len(hits))
            if hits:
                for i, h in enumerate(hits[:3], start=1):
                    recipe = h.get('recipe', {})
                    label = recipe.get('label')
                    image = recipe.get('image')
                    source = recipe.get('source')
                    print(f'- [{i}]', label, '| source:', source)
                    if image:
                        print('  image:', image)
            else:
                print('Full JSON response:')
                print(data)
