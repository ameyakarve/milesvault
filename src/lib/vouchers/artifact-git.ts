import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import { fs as memfs, vol } from 'memfs'

// Shallow-clone an Artifact repo, write a single file at `path`, commit
// (only if the file content actually changed), and push back to `main`.
// Returns `{ changed: false }` when the working tree matches HEAD — the
// caller can skip the empty commit + push round-trip.
//
// `repoUrl` is the artifact's Git remote — e.g.
// `https://<account>.artifacts.cloudflare.net/git/<namespace>/<repo>.git`.
// `token` is a push-scoped Artifact token (from `env.ARTIFACTS.get(...).
// createToken({ scope: 'push' })`).
export async function commitFileToArtifact(opts: {
  repoUrl: string
  token: string
  path: string
  content: string
  authorName?: string
  authorEmail?: string
  message: string
}): Promise<{ changed: boolean; sha?: string }> {
  const dir = '/repo'
  // memfs is module-singleton; reset so workflow re-runs in the same
  // isolate don't see stale files from a prior run.
  vol.reset()
  memfs.mkdirSync(dir, { recursive: true })

  const onAuth = () => ({ username: 'x', password: opts.token })

  await git.clone({
    fs: memfs as unknown as Parameters<typeof git.clone>[0]['fs'],
    http,
    dir,
    url: opts.repoUrl,
    ref: 'main',
    singleBranch: true,
    depth: 1,
    onAuth,
  })

  const fullPath = `${dir}/${opts.path}`
  let previous: string | null = null
  try {
    previous = memfs.readFileSync(fullPath, 'utf8') as string
  } catch {
    previous = null
  }
  if (previous === opts.content) {
    return { changed: false }
  }

  memfs.writeFileSync(fullPath, opts.content)
  await git.add({
    fs: memfs as unknown as Parameters<typeof git.add>[0]['fs'],
    dir,
    filepath: opts.path,
  })
  const sha = await git.commit({
    fs: memfs as unknown as Parameters<typeof git.commit>[0]['fs'],
    dir,
    message: opts.message,
    author: {
      name: opts.authorName ?? 'milesvault-refresh',
      email: opts.authorEmail ?? 'noreply@milesvault.com',
    },
  })
  await git.push({
    fs: memfs as unknown as Parameters<typeof git.push>[0]['fs'],
    http,
    dir,
    remote: 'origin',
    ref: 'main',
    onAuth,
  })

  return { changed: true, sha }
}
