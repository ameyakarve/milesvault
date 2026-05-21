'use client'

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  FileArrowUp,
  FilePdf,
  FileText,
  Image as ImageIcon,
  Lock,
  Paperclip,
  X,
} from '@phosphor-icons/react'

export type UploadedFile = {
  r2_key: string
  filename: string
  content_type: string
  size: number
  markdown: string
  tokens: number
}

export type AttachmentsCardHandle = {
  /** Returns currently uploaded files and clears all internal state. */
  consume: () => UploadedFile[]
  /** Whether any uploaded files are ready to send. */
  hasReady: () => boolean
}

type LocalStatus =
  | { kind: 'inspecting' }
  | { kind: 'needs-password' }
  | { kind: 'decrypting' }
  | { kind: 'uploading' }
  | { kind: 'uploaded'; uploaded: UploadedFile }
  | { kind: 'error'; message: string }

type LocalFile = {
  id: string
  file: File
  displayName: string
  displaySize: number
  displayMime: string
  isEncryptedPdf: boolean
  passwordInput: string
  status: LocalStatus
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function shortMime(mime: string): string {
  if (!mime) return 'file'
  const slash = mime.indexOf('/')
  return slash >= 0 ? mime.slice(slash + 1) : mime
}

function FileIcon({ mime, size = 16 }: { mime: string; size?: number }) {
  if (mime.startsWith('image/'))
    return <ImageIcon size={size} weight="regular" />
  if (mime === 'application/pdf') return <FilePdf size={size} weight="regular" />
  return <FileText size={size} weight="regular" />
}

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = await import('pdfjs-dist')
      mod.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      return mod
    })()
  }
  return pdfjsModulePromise
}

type DetectResult =
  | { kind: 'plain' }
  | { kind: 'encrypted' }
  | { kind: 'error'; message: string }

async function detectPdfEncryption(bytes: Uint8Array): Promise<DetectResult> {
  try {
    const pdfjs = await loadPdfjs()
    const task = pdfjs.getDocument({ data: bytes })
    const doc = await task.promise
    await doc.destroy()
    return { kind: 'plain' }
  } catch (e: unknown) {
    const name = (e as { name?: string } | null)?.name
    if (name === 'PasswordException') return { kind: 'encrypted' }
    const msg = e instanceof Error ? e.message : String(e)
    return { kind: 'error', message: msg }
  }
}

type DecryptResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string }

async function decryptPdf(
  bytes: Uint8Array,
  password: string,
): Promise<DecryptResult> {
  try {
    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({
      data: bytes,
      password,
    }).promise
    const out = await doc.saveDocument()
    await doc.destroy()
    return { ok: true, bytes: out }
  } catch (e: unknown) {
    const name = (e as { name?: string } | null)?.name
    if (name === 'PasswordException') {
      return { ok: false, error: 'wrong-password' }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function uploadToR2(
  data: Blob | File,
  filename: string,
): Promise<UploadedFile> {
  const fd = new FormData()
  const fileToSend =
    data instanceof File
      ? data
      : new File([data], filename, { type: data.type || 'application/octet-stream' })
  fd.append('file', fileToSend, filename)
  const res = await fetch('/api/ingest/upload', {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(msg || `upload failed (${res.status})`)
  }
  return (await res.json()) as UploadedFile
}

type Props = {
  disabled?: boolean
}

export const AttachmentsCard = forwardRef<AttachmentsCardHandle, Props>(
  function AttachmentsCard({ disabled }, ref) {
    const [files, setFiles] = useState<LocalFile[]>([])
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const updateFile = useCallback(
      (id: string, patch: Partial<LocalFile>) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        )
      },
      [],
    )

    const removeFile = useCallback((id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id))
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        consume() {
          const out: UploadedFile[] = []
          for (const f of files) {
            if (f.status.kind === 'uploaded') out.push(f.status.uploaded)
          }
          setFiles([])
          return out
        },
        hasReady() {
          return files.some((f) => f.status.kind === 'uploaded')
        },
      }),
      [files],
    )

    const handleFiles = useCallback(
      async (incoming: FileList | File[]) => {
        const arr = Array.from(incoming)
        if (arr.length === 0) return
        const additions: LocalFile[] = arr.map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          displayName: file.name,
          displaySize: file.size,
          displayMime: file.type || 'application/octet-stream',
          isEncryptedPdf: false,
          passwordInput: '',
          status: { kind: 'inspecting' },
        }))
        setFiles((prev) => [...prev, ...additions])

        for (const local of additions) {
          if (local.file.type === 'application/pdf') {
            const bytes = new Uint8Array(await local.file.arrayBuffer())
            const detect = await detectPdfEncryption(bytes)
            if (detect.kind === 'encrypted') {
              updateFile(local.id, {
                isEncryptedPdf: true,
                status: { kind: 'needs-password' },
              })
              continue
            }
            if (detect.kind === 'error') {
              updateFile(local.id, {
                status: { kind: 'error', message: detect.message },
              })
              continue
            }
          }
          updateFile(local.id, { status: { kind: 'uploading' } })
          try {
            const uploaded = await uploadToR2(local.file, local.displayName)
            updateFile(local.id, {
              status: { kind: 'uploaded', uploaded },
            })
          } catch (e) {
            updateFile(local.id, {
              status: {
                kind: 'error',
                message: e instanceof Error ? e.message : 'upload failed',
              },
            })
          }
        }
      },
      [updateFile],
    )

    const submitPassword = useCallback(
      async (id: string) => {
        const current = files.find((f) => f.id === id)
        if (!current) return
        const password = current.passwordInput
        if (!password) return
        updateFile(id, { status: { kind: 'decrypting' } })
        const bytes = new Uint8Array(await current.file.arrayBuffer())
        const decrypted = await decryptPdf(bytes, password)
        if (decrypted.ok === false) {
          const errMsg = decrypted.error
          if (errMsg === 'wrong-password') {
            updateFile(id, {
              status: { kind: 'needs-password' },
              passwordInput: '',
            })
          } else {
            updateFile(id, {
              status: { kind: 'error', message: errMsg },
            })
          }
          return
        }
        updateFile(id, { status: { kind: 'uploading' } })
        const blob = new Blob([decrypted.bytes], { type: 'application/pdf' })
        try {
          const uploaded = await uploadToR2(blob, current.file.name)
          updateFile(id, {
            displaySize: blob.size,
            passwordInput: '',
            status: { kind: 'uploaded', uploaded },
          })
        } catch (e) {
          updateFile(id, {
            status: {
              kind: 'error',
              message: e instanceof Error ? e.message : 'upload failed',
            },
          })
        }
      },
      [files, updateFile],
    )

    function onPickClick() {
      fileInputRef.current?.click()
    }

    function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
      if (e.target.files) void handleFiles(e.target.files)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function onDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault()
      setDragOver(false)
      if (disabled) return
      if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files)
    }

    if (files.length === 0) {
      return (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mb-2 flex items-center justify-between gap-3 rounded-[10px] border border-dashed px-3 py-2 text-xs transition ${
            dragOver
              ? 'border-teal-400 bg-teal-50/60 text-teal-700'
              : 'border-slate-200 bg-slate-50/60 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileArrowUp size={14} weight="regular" />
            <span>Drop a statement here or</span>
            <button
              type="button"
              onClick={onPickClick}
              disabled={disabled}
              className="underline-offset-2 hover:underline disabled:opacity-40"
            >
              choose a file
            </button>
            <span className="text-slate-400">· PDF, CSV, OFX, image</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.csv,.ofx,.qif,.png,.jpg,.jpeg,.webp,.txt,application/pdf,text/csv,image/*"
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      )
    }

    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mb-2 rounded-[12px] border bg-white transition ${
          dragOver ? 'border-teal-400' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
            <Paperclip size={11} weight="regular" />
            Attachments · {files.length}
          </div>
          <button
            type="button"
            onClick={onPickClick}
            disabled={disabled}
            className="text-[11px] text-teal-600 hover:text-teal-700 disabled:opacity-40"
          >
            + Add
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.csv,.ofx,.qif,.png,.jpg,.jpeg,.webp,.txt,application/pdf,text/csv,image/*"
            className="hidden"
            onChange={onInputChange}
          />
        </div>
        <ul className="divide-y divide-slate-100">
          {files.map((f) => (
            <li key={f.id} className="px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0 text-slate-400">
                  <FileIcon mime={f.displayMime} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-slate-900">
                      {f.displayName}
                    </span>
                    {f.isEncryptedPdf && (
                      <Lock
                        size={11}
                        weight="regular"
                        className="shrink-0 text-amber-500"
                      />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{formatSize(f.displaySize)}</span>
                    <span className="text-slate-300">·</span>
                    <span>{shortMime(f.displayMime)}</span>
                    <span className="text-slate-300">·</span>
                    <StatusLabel status={f.status} />
                  </div>
                  {f.status.kind === 'needs-password' && (
                    <form
                      className="mt-2 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void submitPassword(f.id)
                      }}
                    >
                      <input
                        type="password"
                        autoFocus
                        value={f.passwordInput}
                        placeholder="PDF password"
                        onChange={(e) =>
                          updateFile(f.id, { passwordInput: e.target.value })
                        }
                        className="flex-1 rounded-[6px] border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-teal-500"
                      />
                      <button
                        type="submit"
                        disabled={!f.passwordInput}
                        className="rounded-[6px] bg-teal-500 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-teal-600 disabled:opacity-40"
                      >
                        Unlock
                      </button>
                    </form>
                  )}
                  {f.status.kind === 'error' && (
                    <div className="mt-1 text-[11px] text-rose-600">
                      {f.status.message}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="shrink-0 text-slate-400 hover:text-slate-700"
                  aria-label="Remove attachment"
                >
                  <X size={12} weight="bold" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  },
)

function StatusLabel({ status }: { status: LocalStatus }) {
  switch (status.kind) {
    case 'inspecting':
      return <span className="text-slate-400">inspecting…</span>
    case 'needs-password':
      return <span className="text-amber-600">password required</span>
    case 'decrypting':
      return <span className="text-slate-400">decrypting…</span>
    case 'uploading':
      return <span className="text-slate-400">uploading…</span>
    case 'uploaded':
      return <span className="text-teal-600">ready</span>
    case 'error':
      return <span className="text-rose-600">failed</span>
  }
}
