import './HeritageArtworkPanel.css';

/**
 * HeritageArtworkPanel — LegacyVault
 * ONE continuous, unified artistic background (Single Composition):
 * - Deep Forest Green bedrock
 * - Sweeping organic jade, malachite & agate marble swirls
 * - Flowing warm gold & canary filament veins
 * - Subtle raked organic stone strata
 * - Pure uninterrupted editorial visual presentation (No cards, no gutters, no badges)
 */
export default function HeritageArtworkPanel({ lang = 'vi' }) {
  const isVi = lang === 'vi';

  return (
    <div
      className="heritage-artwork-canvas"
      role="img"
      aria-label={
        isVi
          ? 'Tác phẩm nghệ thuật thị giác trừu tượng LegacyVault: Dòng chảy cẩm thạch ngọc bích và nhịp sống di sản trường tồn'
          : 'LegacyVault abstract visual artwork: Continuous organic jade marble flow and digital sanctuary'
      }
    >
      <svg
        className="unified-artwork-svg"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Base Bedrock Gradient */}
          <linearGradient id="lvCanvasDeep" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#082b15" />
            <stop offset="35%" stopColor="#0d3f20" />
            <stop offset="70%" stopColor="#0a3319" />
            <stop offset="100%" stopColor="#04160a" />
          </linearGradient>

          {/* Left Strata Texture Blend */}
          <linearGradient id="strataBlend" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.06)" />
            <stop offset="40%" stopColor="rgba(221, 246, 35, 0.04)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </linearGradient>

          {/* Fine raked stone pattern on left flank */}
          <pattern
            id="rakedFlow"
            width="20"
            height="20"
            patternTransform="rotate(35 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <line x1="10" y1="0" x2="10" y2="20" stroke="rgba(221, 246, 35, 0.04)" strokeWidth="0.8" />
            <line x1="20" y1="0" x2="20" y2="20" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
          </pattern>

          {/* Malachite Deep River */}
          <linearGradient id="flowMalachite" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#073b1d" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#15803d" stopOpacity="0.85" />
            <stop offset="75%" stopColor="#166534" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#052e16" stopOpacity="0.95" />
          </linearGradient>

          {/* Jade Swirl Wave */}
          <linearGradient id="flowJade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="45%" stopColor="#166534" stopOpacity="0.8" />
            <stop offset="85%" stopColor="#047857" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#022c15" stopOpacity="0.95" />
          </linearGradient>

          {/* Signature Mint Seafoam Ribbon */}
          <linearGradient id="flowSeafoam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#6ee7b7" stopOpacity="0.88" />
            <stop offset="70%" stopColor="#34d399" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.15" />
          </linearGradient>

          {/* Pale Celadon Crest Line */}
          <linearGradient id="flowCeladon" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d1fae5" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#a7f3d0" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.4" />
          </linearGradient>

          {/* Warm Gold Highlight Filament */}
          <linearGradient id="flowGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(234, 179, 8, 0)" />
            <stop offset="25%" stopColor="rgba(253, 224, 71, 0.75)" />
            <stop offset="50%" stopColor="rgba(250, 204, 21, 0.95)" />
            <stop offset="75%" stopColor="rgba(202, 138, 4, 0.85)" />
            <stop offset="100%" stopColor="rgba(234, 179, 8, 0)" />
          </linearGradient>

          {/* Canary Accent Line */}
          <linearGradient id="flowCanary" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(221, 246, 35, 0)" />
            <stop offset="40%" stopColor="rgba(221, 246, 35, 0.85)" />
            <stop offset="60%" stopColor="rgba(240, 255, 90, 0.95)" />
            <stop offset="100%" stopColor="rgba(221, 246, 35, 0)" />
          </linearGradient>

          {/* Subtle Stone Micro-Grain Filter */}
          <filter id="unifiedNoise" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" result="turb" />
            <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.07 0" />
            <feBlend mode="overlay" in2="SourceGraphic" />
          </filter>
        </defs>

        {/* 1. Base Bedrock */}
        <rect width="100%" height="100%" fill="url(#lvCanvasDeep)" filter="url(#unifiedNoise)" />

        {/* 2. Integrated Left Strata Micro-Grooves (No border, seamlessly blends) */}
        <rect x="0" y="0" width="340" height="1000" fill="url(#rakedFlow)" />
        <rect x="0" y="0" width="340" height="1000" fill="url(#strataBlend)" />

        {/* 3. Deep Strata Shadows and Natural Topographic Undulations */}
        <path
          d="M-40 0 C 140 320, 260 620, 160 1000 L 0 1000 L 0 0 Z"
          fill="rgba(4, 22, 11, 0.55)"
        />

        {/* 4. Malachite Fluid Flow (Broad sweeping S-curve river) */}
        <path
          d="M380 -50 C 580 140, 840 200, 740 440 C 620 660, 320 620, 480 840 C 570 940, 720 980, 880 1050 L 1050 1050 L 1050 -50 Z"
          fill="url(#flowMalachite)"
        />

        {/* 5. Deep Jade Wave River */}
        <path
          d="M450 -50 C 640 160, 800 250, 690 470 C 580 670, 360 660, 520 860 C 600 960, 730 990, 860 1050 L 1050 1050 L 1050 -50 Z"
          fill="url(#flowJade)"
        />

        {/* 6. Mid-tone Emerald Swirl Layer */}
        <path
          d="M260 -50 C 440 180, 640 310, 530 500 C 420 690, 220 660, 360 860 C 450 960, 580 990, 720 1050 L 600 1050 C 460 960, 340 940, 260 840 C 120 640, 320 660, 410 470 C 500 290, 320 160, 160 -50 Z"
          fill="#0c4a24"
          opacity="0.88"
        />

        {/* 7. The Signature Mint Seafoam Ribbon */}
        <path
          d="M580 -50 C 740 130, 830 290, 720 480 C 610 670, 410 700, 560 890 C 650 990, 760 1020, 880 1050 L 800 1050 C 690 990, 580 960, 490 860 C 340 670, 520 630, 630 460 C 730 280, 640 130, 500 -50 Z"
          fill="url(#flowSeafoam)"
          filter="blur(2px)"
        />

        {/* 8. Pale Celadon Inner Crest Ribbon */}
        <path
          d="M620 -30 C 760 140, 825 295, 730 475 C 635 655, 450 685, 585 880 C 660 980, 755 1010, 855 1045 L 825 1045 C 730 985, 635 960, 565 865 C 430 675, 610 640, 700 465 C 790 295, 730 145, 595 -30 Z"
          fill="url(#flowCeladon)"
          opacity="0.82"
          filter="blur(1px)"
        />

        {/* 9. Warm Gold Highlight Filament */}
        <path
          d="M600 -50 C 750 135, 825 290, 722 478 C 622 665, 418 695, 568 888 C 652 982, 758 1015, 868 1050"
          fill="none"
          stroke="url(#flowGold)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* 10. Canary Lime Accent Micro-Ribbon */}
        <path
          d="M640 -30 C 780 150, 840 305, 742 488 C 642 672, 455 700, 595 892 C 672 988, 772 1018, 880 1050"
          fill="none"
          stroke="url(#flowCanary)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* 11. Atmospheric Right Prism Glow */}
        <ellipse cx="820" cy="380" rx="200" ry="400" fill="rgba(110, 231, 183, 0.12)" filter="blur(60px)" />
        <ellipse cx="880" cy="780" rx="160" ry="240" fill="rgba(221, 246, 35, 0.08)" filter="blur(55px)" />

        {/* 12. Deep Ambient Shadows & Lighting Gradients */}
        <circle cx="160" cy="240" r="280" fill="rgba(3, 18, 8, 0.7)" filter="blur(60px)" />
        <circle cx="680" cy="480" r="180" fill="rgba(221, 246, 35, 0.1)" filter="blur(45px)" />
        <circle cx="360" cy="850" r="260" fill="rgba(2, 15, 7, 0.75)" filter="blur(65px)" />
      </svg>
    </div>
  );
}
