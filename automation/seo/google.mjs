// Google API 認証（GitHub Actions の google-github-actions/auth が用意した認証情報を使う）
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

export async function googleFetch(url, options = {}) {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
