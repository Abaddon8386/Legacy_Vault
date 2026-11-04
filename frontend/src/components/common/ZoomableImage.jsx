import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import './ZoomableImage.css';

const MIN_ZOOM = 50, MAX_ZOOM = 300, ZOOM_STEP = 25;

/** Image fitted to its frame at 100%; zooming in scrolls inside the frame. Height comes from --lv-zoom-height. */
export default function ZoomableImage({ src, alt, lang = 'vi' }) {
  const en = lang === 'en';
  const [zoom, setZoom] = useState(100);
  const size = `${zoom}%`;
  return <div className="lv-zoomable">
    <div className="lv-zoomable__toolbar" role="group" aria-label={en ? 'Image zoom' : 'Thu phóng ảnh'}>
      <button type="button" onClick={() => setZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label={en ? 'Zoom out' : 'Thu nhỏ'}><Minus size={16} aria-hidden="true" /></button>
      <button type="button" onClick={() => setZoom(100)} disabled={zoom === 100} aria-label={en ? 'Reset zoom' : 'Về kích thước vừa khung'}><span aria-live="polite">{size}</span></button>
      <button type="button" onClick={() => setZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={en ? 'Zoom in' : 'Phóng to'}><Plus size={16} aria-hidden="true" /></button>
    </div>
    <div className="lv-zoomable__frame" tabIndex={0} role="group" aria-label={alt}>
      <img src={src} alt={alt} style={{ width: size, height: size }} />
    </div>
  </div>;
}
