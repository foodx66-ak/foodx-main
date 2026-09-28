// git 操作と PR 作成（GITHUB_TOKEN を使用。個人トークン不要）
import { execFileSync } from 'node:child_process';

export function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

export async function createPullRequest({ head, base = 'main', title, body }) {
  const repo = process.env.GITHUB_REPOSITORY;
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ head, base, title, body }),
  });
  if (!res.ok) throw new Error(`PR作成に失敗 ${res.status}（リポジトリ設定「Allow GitHub Actions to create and approve pull requests」を確認）`);
  return (await res.json()).html_url;
}
