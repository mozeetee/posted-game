import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

// Renders the raw pixels of a crop region onto a canvas and returns a JPEG data URL.
async function getCroppedDataUrl(imageSrc, cropPixels, maxDim = 1000) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })

  const scale = Math.min(1, maxDim / Math.max(cropPixels.width, cropPixels.height))
  const outW = Math.round(cropPixels.width * scale)
  const outH = Math.round(cropPixels.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, outW, outH)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Full-screen modal for cropping an image to a fixed aspect ratio before it's saved.
// `aspect` is width/height (e.g. 1 for square). Calls onConfirm(dataUrl) or onCancel().
export function CropModal({ imageSrc, aspect, maxDim = 1000, onConfirm, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [saving, setSaving] = useState(false)

  const onCropComplete = useCallback((_, pixels) => setCroppedAreaPixels(pixels), [])

  async function handleConfirm() {
    if (!croppedAreaPixels) return
    setSaving(true)
    const dataUrl = await getCroppedDataUrl(imageSrc, croppedAreaPixels, maxDim)
    setSaving(false)
    onConfirm(dataUrl)
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#ffd166', marginBottom: 4, fontWeight: 700 }}>CROP IMAGE</div>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 14 }}>Drag to reposition, scroll or pinch to zoom. This exact framing is what players will see.</div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 10, color: '#555', letterSpacing: 1 }}>ZOOM</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button style={cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={{ ...confirmBtn, opacity: saving ? 0.6 : 1 }} onClick={handleConfirm} disabled={saving}>{saving ? 'Saving…' : '✓ Use This Crop'}</button>
        </div>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: '#000000cc', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }
const modal = { width: '100%', maxWidth: 460, background: '#111120', border: '1px solid #222', borderRadius: 8, padding: 20, fontFamily: "'Courier New', monospace" }
const cancelBtn = { flex: 1, padding: '12px 16px', background: 'none', border: '1px solid #333', color: '#aaa', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontFamily: "'Courier New', monospace" }
const confirmBtn = { flex: 1, padding: '12px 16px', background: '#ffd166', border: 'none', color: '#111', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: "'Arial Black', sans-serif" }
