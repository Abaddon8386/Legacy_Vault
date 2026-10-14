import { useRef, useCallback, useEffect } from 'react';
import './LivingHeritageWave.css';

/**
 * LivingHeritageWave — LegacyVault Living Interface Artwork
 *
 * Artwork nghệ thuật chuyển động liên tục kết hợp phản xạ vật lý tự nhiên:
 * - Dòng chảy sóng tự động vô hạn (6.5s – 11s) uốn lượn liên tục êm ái
 * - Tương tác đẩy sóng theo chuột (Cursor Repulsion):
 *   + Khi con trỏ tiến gần một làn sóng, vùng sóng gần chuột dịch chuyển nhẹ ra xa con trỏ
 *   + Bán kính ảnh hưởng (Influence Radius): ~130px trong không gian SVG (tương đương 90–110px thực tế)
 *   + Biên độ đẩy cực đại: 12–22px tại dải sóng gần nhất (Gold ribbon: 22px, Mid: 16px, Deep: 10px, Light: 18px)
 *   + Sóng ở xa chuột giữ nguyên vị trí, không làm dịch chuyển nguyên khối cả bức tranh
 *   + Khi chuột rời đi, sóng hồi phục về vị trí cân bằng bằng hiệu ứng spring/damping mềm mại
 * - Tương thích hoàn toàn với prefers-reduced-motion và thiết bị cảm ứng
 */

// Layer elevation centers in SVG coordinate space (600x400)
// Calibrated for gentle silk ribbon breeze dynamics (Henedo Motion Standard):
// - Gold Wave: max 9px vertical, 2.5px lateral (guideline: 8–10px)
// - Light Seafoam: max 6.5px vertical, 2.0px lateral (guideline: 5–8px)
// - Mid Jade: max 5px vertical, 1.5px lateral (guideline: 4–6px)
// - Deep Forest: max 3px vertical, 1.0px lateral (guideline: 2–4px)
const LAYER_PROFILES = {
  gold:  { y0: 240, maxDispY: 9,   maxDispX: 2.5, radius: 120 },
  mid:   { y0: 300, maxDispY: 5,   maxDispX: 1.5, radius: 115 },
  deep:  { y0: 340, maxDispY: 3,   maxDispX: 1.0, radius: 100 },
  light: { y0: 130, maxDispY: 6.5, maxDispX: 2.0, radius: 110 },
};

export default function LivingHeritageWave({ lang = 'vi' }) {
  const isVi = lang === 'vi';
  const panelRef = useRef(null);

  // Physics engine reference holding state across animation frames
  const physicsRef = useRef({
    layers: {
      gold:  { currentX: 0, currentY: 0, targetX: 0, targetY: 0, vx: 0, vy: 0 },
      mid:   { currentX: 0, currentY: 0, targetX: 0, targetY: 0, vx: 0, vy: 0 },
      deep:  { currentX: 0, currentY: 0, targetX: 0, targetY: 0, vx: 0, vy: 0 },
      light: { currentX: 0, currentY: 0, targetX: 0, targetY: 0, vx: 0, vy: 0 },
    },
    isHovering: false,
    schedule: null,
  });

  // Physical simulation loop & lifecycle
  useEffect(() => {
    const physics = physicsRef.current;
    let currentRafId = null;

    const step = () => {
      const p = physics;
      // Gentle silk breeze dynamics: soft spring (0.07) + higher damping (0.82)
      const SPRING = 0.07;
      const DAMPING = 0.82;

      let isMoving = false;
      const layers = p.layers;

      for (const key of ['gold', 'mid', 'deep', 'light']) {
        const l = layers[key];

        // Spring displacement acceleration
        const ax = (l.targetX - l.currentX) * SPRING;
        l.vx = (l.vx + ax) * DAMPING;
        l.currentX += l.vx;

        const ay = (l.targetY - l.currentY) * SPRING;
        l.vy = (l.vy + ay) * DAMPING;
        l.currentY += l.vy;

        // Check if motion has ceased
        const speed = Math.abs(l.vx) + Math.abs(l.vy);
        const delta = Math.abs(l.targetX - l.currentX) + Math.abs(l.targetY - l.currentY);

        if (speed > 0.02 || delta > 0.02) {
          isMoving = true;
        } else if (!p.isHovering) {
          // Snap to exact zero when settled at rest
          l.currentX = 0;
          l.currentY = 0;
          l.vx = 0;
          l.vy = 0;
        }
      }

      // Apply computed displacements directly to DOM CSS variables for 60fps smoothness
      const el = panelRef.current;
      if (el) {
        el.style.setProperty('--repel-gold-x', `${layers.gold.currentX.toFixed(2)}px`);
        el.style.setProperty('--repel-gold-y', `${layers.gold.currentY.toFixed(2)}px`);
        el.style.setProperty('--repel-mid-x', `${layers.mid.currentX.toFixed(2)}px`);
        el.style.setProperty('--repel-mid-y', `${layers.mid.currentY.toFixed(2)}px`);
        el.style.setProperty('--repel-deep-x', `${layers.deep.currentX.toFixed(2)}px`);
        el.style.setProperty('--repel-deep-y', `${layers.deep.currentY.toFixed(2)}px`);
        el.style.setProperty('--repel-light-x', `${layers.light.currentX.toFixed(2)}px`);
        el.style.setProperty('--repel-light-y', `${layers.light.currentY.toFixed(2)}px`);
      }

      if (isMoving || p.isHovering) {
        currentRafId = requestAnimationFrame(step);
      } else {
        currentRafId = null;
      }
    };

    physics.schedule = () => {
      if (!currentRafId) {
        currentRafId = requestAnimationFrame(step);
      }
    };

    const handleBlur = () => {
      physics.isHovering = false;
      for (const key of ['gold', 'mid', 'deep', 'light']) {
        physics.layers[key].targetX = 0;
        physics.layers[key].targetY = 0;
      }
      physics.schedule();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleBlur);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleBlur);
      if (currentRafId) {
        cancelAnimationFrame(currentRafId);
      }
      physics.schedule = null;
    };
  }, []);

  // Pointer move handler calculating local repulsion per layer
  const handleMouseMove = useCallback((e) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Convert mouse coordinates into SVG space (600x400)
    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const mouseY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const svgX = (mouseX / rect.width) * 600;
    const svgY = (mouseY / rect.height) * 400;

    physicsRef.current.isHovering = true;
    const layers = physicsRef.current.layers;

    // Calculate repulsive push on each layer based on proximity to its elevation
    for (const key of ['gold', 'mid', 'deep', 'light']) {
      const cfg = LAYER_PROFILES[key];
      const deltaY = cfg.y0 - svgY;
      const dist = Math.abs(deltaY);

      if (dist < cfg.radius) {
        // Quadratic falloff: strongest nearest the cursor, falls off to 0 at radius boundary
        const intensity = Math.pow(1 - dist / cfg.radius, 2);

        // Repulsion direction: push away from mouse
        // If cursor is above wave (svgY < y0), push downward (+Y)
        // If cursor is below wave (svgY > y0), push upward (-Y)
        const signY = deltaY >= 0 ? 1 : -1;
        const pushY = signY * cfg.maxDispY * intensity;

        // Gentle lateral parting away from cursor horizontal center
        const signX = svgX > 300 ? -1 : 1;
        const pushX = signX * cfg.maxDispX * intensity;

        layers[key].targetX = pushX;
        layers[key].targetY = pushY;
      } else {
        // Outside influence radius -> this wave is completely undisturbed!
        layers[key].targetX = 0;
        layers[key].targetY = 0;
      }
    }

    if (physicsRef.current.schedule) {
      physicsRef.current.schedule();
    }
  }, []);

  const handleMouseEnter = useCallback((e) => {
    handleMouseMove(e);
  }, [handleMouseMove]);

  const handleMouseLeave = useCallback(() => {
    physicsRef.current.isHovering = false;
    const layers = physicsRef.current.layers;

    // Return all wave layers smoothly to neutral equilibrium
    for (const key of ['gold', 'mid', 'deep', 'light']) {
      layers[key].targetX = 0;
      layers[key].targetY = 0;
    }

    if (physicsRef.current.schedule) {
      physicsRef.current.schedule();
    }
  }, []);

  return (
    <div
      ref={panelRef}
      className="lv-living-wave-container"
      role="img"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={
        isVi
          ? 'Không gian thị giác sống động LegacyVault: Nhịp sóng ngọc bích và dòng chảy di sản vàng trường tồn'
          : 'LegacyVault Living Sanctuary Artwork: Flowing jade waves and generational gold streams'
      }
    >
      {/* Ambient Breathing Aura — Gentle background depth (no harsh cursor circle) */}
      <div className="lv-wave-ambient-glow" aria-hidden="true" />

      {/* Top Sanctuary Badge */}
      <div className="lv-wave-emblem-wrap" aria-hidden="true">
        <svg
          className="lv-wave-emblem-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <span className="lv-wave-emblem-text">
          {isVi ? 'Không gian di sản' : 'Living Sanctuary'}
        </span>
      </div>

      {/* Multi-layered Living SVG Waves with Independent Physical Repulsion Envelopes */}
      <svg
        className="lv-living-wave-svg"
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Base Forest Deep Gradient */}
          <linearGradient id="lvBgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#08261c" />
            <stop offset="50%" stopColor="#0e3427" />
            <stop offset="100%" stopColor="#051c14" />
          </linearGradient>

          {/* Deep Jade Bedrock Gradient */}
          <linearGradient id="lvJadeDeepGrad" x1="0%" y1="0%" x2="100%" y2="80%">
            <stop offset="0%" stopColor="#0d3f2d" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#165b43" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0a2a1f" stopOpacity="0.95" />
          </linearGradient>

          {/* Mid Malachite River Gradient */}
          <linearGradient id="lvMalachiteGrad" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e7b5b" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#299972" stopOpacity="0.75" />
            <stop offset="80%" stopColor="#176349" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0d3829" stopOpacity="0.9" />
          </linearGradient>

          {/* Sand Gold Shimmer Ribbon Gradient */}
          <linearGradient id="lvGoldRibbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f3deb0" stopOpacity="0.9" />
            <stop offset="30%" stopColor="#c5a059" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#e8cf96" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#9a7732" stopOpacity="0.7" />
          </linearGradient>

          {/* Pale Seafoam Silk Gradient */}
          <linearGradient id="lvSeafoamGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#6ee7b7" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.05" />
          </linearGradient>

          {/* Gold Crest Glow Filter */}
          <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Backdrop Subtle Organic Grid Lines */}
        <g opacity="0.12" stroke="#c5a059" strokeWidth="0.75" fill="none">
          <circle cx="300" cy="200" r="140" strokeDasharray="3 6" />
          <circle cx="300" cy="200" r="220" strokeDasharray="4 8" />
          <line x1="0" y1="200" x2="600" y2="200" strokeDasharray="6 8" />
        </g>

        {/* ================================================================
            LAYER 1: SÓNG NỀN CẨM THẠCH NGỌC BÍCH SẪM (DEEP JADE)
            Outer: Spring Repulsion Envelope | Inner: Continuous Drift
            ================================================================ */}
        <g className="lv-wave-repel-deep">
          <g className="lv-wave-path-deep">
            <path
              d="M-80 260 C 60 190, 160 320, 280 240 C 400 160, 500 280, 680 210 L 680 440 L -80 440 Z"
              fill="url(#lvJadeDeepGrad)"
            />
            <path
              d="M-80 260 C 60 190, 160 320, 280 240 C 400 160, 500 280, 680 210"
              fill="none"
              stroke="rgba(197, 160, 89, 0.35)"
              strokeWidth="1.5"
            />
          </g>
        </g>

        {/* ================================================================
            LAYER 2: SÓNG NGỌC LỤC BẢO CHUYỂN DỊCH NGƯỢC CHIỀU (MALACHITE)
            Outer: Spring Repulsion Envelope | Inner: Continuous Drift
            ================================================================ */}
        <g className="lv-wave-repel-mid">
          <g className="lv-wave-path-mid">
            <path
              d="M-80 300 C 90 360, 210 220, 340 310 C 470 390, 570 240, 680 320 L 680 440 L -80 440 Z"
              fill="url(#lvMalachiteGrad)"
            />
            <path
              d="M-80 300 C 90 360, 210 220, 340 310 C 470 390, 570 240, 680 320"
              fill="none"
              stroke="#a7f3d0"
              strokeWidth="1.2"
              opacity="0.45"
            />
          </g>
        </g>

        {/* ================================================================
            LAYER 3: SỢI SÓNG VÀNG CÁT SAND GOLD QUÝ TỘC (GOLD FILAMENT)
            Outer: Spring Repulsion Envelope | Inner: Continuous Drift
            ================================================================ */}
        <g className="lv-wave-repel-gold">
          <g className="lv-wave-path-gold">
            {/* Ribbon fill */}
            <path
              d="M-80 210 C 80 290, 220 140, 360 250 C 490 340, 580 180, 680 270 L 680 330 C 580 240, 490 380, 360 300 C 220 190, 80 340, -80 260 Z"
              fill="url(#lvGoldRibbonGrad)"
              opacity="0.78"
            />
            {/* Crisp luminous crest stroke with subtle glow */}
            <path
              d="M-80 210 C 80 290, 220 140, 360 250 C 490 340, 580 180, 680 270"
              fill="none"
              stroke="#fff2cc"
              strokeWidth="2.4"
              filter="url(#goldGlow)"
            />
            {/* Echo echo vein */}
            <path
              d="M-80 225 C 80 305, 220 155, 360 265 C 490 355, 580 195, 680 285"
              fill="none"
              stroke="#c5a059"
              strokeWidth="1"
              opacity="0.55"
            />
          </g>
        </g>

        {/* ================================================================
            LAYER 4: LỤA NGỌC BỒNG BỀNH GÓC TRÊN (SEAFOAM SILK)
            Outer: Spring Repulsion Envelope | Inner: Continuous Drift
            ================================================================ */}
        <g className="lv-wave-repel-light">
          <g className="lv-wave-path-light">
            <path
              d="M-60 130 C 120 70, 260 210, 420 110 C 520 50, 620 160, 680 120 L 680 230 C 620 270, 520 160, 420 220 C 260 310, 120 170, -60 230 Z"
              fill="url(#lvSeafoamGrad)"
            />
            <path
              d="M-60 130 C 120 70, 260 210, 420 110 C 520 50, 620 160, 680 120"
              fill="none"
              stroke="#d1fae5"
              strokeWidth="1"
              opacity="0.6"
              strokeDasharray="4 6"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
