import { useRef } from 'react'

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function compressImage(dataUrl, maxDim = 900) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      const scale = Math.min(1, maxDim / Math.max(width, height))
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = dataUrl
  })
}

export function ImageUploadSlot({ label, hint, value, onChange, accentColor = '#ffd166' }) {
  const inputRef = useRef(null)

  async function processFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const raw = await readFileAsDataUrl(file)
    const compressed = await compressImage(raw, 900)
    onChange(compressed)
  }

  function handleInput(e) { processFile(e.target.files?.[0]); e.target.value = '' }
  function handleDrop(e) { e.preventDefault(); processFile(e.dataTransfer.files?.[0]) }

  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 10, letterSpacing: 2, color: '#555', marginBottom: 6, fontWeight: 700 }}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 11, color: '#444', marginBottom: 8 }}>{hint}</div>}
      {value ? (
        <div style={{ position: 'relative' }}>
          <img src={value} alt="uploaded" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 6, display: 'block', border: `1px solid ${accentColor}33` }} />
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button onClick={() => inputRef.current?.click()} style={miniBtn('#1a1a2e', '#aaa')}>↺ Replace</button>
            <button onClick={() => onChange(null)} style={miniBtn('#2a0a0a', '#ff6b6b')}>✕ Remove</button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInput} />
        </div>
      ) : (
        <div
          style={{ border: `1px dashed ${accentColor}44`, borderRadius: 6, padding: '22px 16px', textAlign: 'center', cursor: 'pointer', background: '#0d0d1a' }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div style={{ fontSize: 26, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 12, color: '#555' }}>Click to upload or drag & drop</div>
          <div style={{ fontSize: 10, color: '#333', marginTop: 3 }}>PNG · JPG · GIF · WEBP</div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInput} />
        </div>
      )}
    </div>
  )
}

function miniBtn(bg, color) {
  return { background: bg, border: 'none', color, fontSize: 11, padding: '4px 9px', borderRadius: 3, cursor: 'pointer', fontFamily: "'Courier New', monospace" }
}
