---
name: Imperial Celebration
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#383939'
  surface-container-lowest: '#0d0f0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2a'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#e8bdb6'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#ae8882'
  outline-variant: '#5e3f3a'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690000'
  primary-container: '#cc0000'
  on-primary-container: '#ffdad4'
  inverse-primary: '#c00000'
  secondary: '#fff9ef'
  on-secondary: '#3a3000'
  secondary-container: '#ffdb3c'
  on-secondary-container: '#725f00'
  tertiary: '#ffb59c'
  on-tertiary: '#5c1900'
  tertiary-container: '#b53a00'
  on-tertiary-container: '#ffdbcf'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930000'
  secondary-fixed: '#ffe16d'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#822700'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
  silk-red-deep: '#8b0000'
  silk-red-bright: '#d40000'
  liquid-gold-light: '#fff7d1'
  liquid-gold-dark: '#b8860b'
  glass-border: rgba(255, 255, 255, 0.2)
  live-indicator: '#ffb4a8'
typography:
  display-lg:
    fontFamily: Noto Serif SC
    fontSize: 40px
    fontWeight: '900'
    lineHeight: 52px
    letterSpacing: 2px
  headline-md:
    fontFamily: Noto Serif SC
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md-mobile:
    fontFamily: Noto Serif SC
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 1px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  inline-padding: 8px
  container-margin: 16px
  element-gap: 12px
  section-padding: 24px
---

## Brand & Style

The brand identity is rooted in the "Imperial Celebration" aesthetic—a high-energy, prestigious, and culturally resonant style designed for major life milestones and celebratory live events. It targets an audience seeking a sense of honor, community, and tradition, specifically within an educational or ceremonial context.

The UI utilizes a **Maximalist Silk & Glass** style. It blends traditional "Red & Gold" imperial motifs with modern digital flourishes like glassmorphism, continuous animations (breathing borders, pulse effects), and interactive particle systems. The goal is to evoke a sense of excitement, prestige, and "digital auspiciousness" that feels both premium and festive.

## Colors

The palette is dominated by **Imperial Red** and **Liquid Gold**. 

- **Primary Red:** Used as a rich, silk-textured background gradient (ranging from `#8b0000` to `#d40000`). It represents energy and success.
- **Secondary Gold:** Used for highlights, interactive borders, and "Liquid Gold" typography. It provides a luminous, high-contrast accent against the red.
- **Neutral/Background:** A deep obsidian (`#121414`) is used for container backgrounds to make the gold and red elements pop without visual fatigue.
- **Glass Effects:** Semi-transparent whites and golds are used for overlay cards to maintain the depth of the silk background.

## Typography

The typography system uses a tri-font strategy to balance tradition and modernity:

- **Headlines:** Use **Noto Serif SC** (notoSerif) for a classic, authoritative, and celebratory feel. Major titles utilize a "Liquid Gold" vertical gradient and drop shadows to simulate metallic embossing.
- **Body:** Use **Be Vietnam Pro** (beVietnamPro) for high legibility in interactive sections and messaging.
- **Labels:** Use **Plus Jakarta Sans** (plusJakartaSans) for all-caps tracking, UI metadata, and status indicators (like the LIVE badge).

For mobile devices, the display size scales down to 26px for main headers to ensure text remains impactful without overflowing.

## Layout & Spacing

The system follows a **Dynamic Fluid Grid** optimized for mobile-first consumption. 

- **Margins:** A standard 16px (`container-margin`) horizontal gutter ensures content doesn't hit the screen edges.
- **Vertical Rhythm:** Sections are separated by a 24px padding, while internal card elements use a 12px gap.
- **Safe Zones:** The layout accounts for a fixed, high-profile header (approx 160px-190px height) and utilizes "Glass Cards" to ensure content remains readable even as it scrolls over complex background textures.
- **Mobile Adaptivity:** Containers are designed to stretch full-width on mobile but should center-align with a max-width of 480px on larger viewports to maintain the "mobile-app" feel.

## Elevation & Depth

Visual hierarchy is established through **Luminous Layering** rather than traditional drop shadows:

- **Silk Layer:** The base layer is a 135-degree red gradient with a radial "wave" overlay.
- **Glass Layer:** Interactive modules use a 10% white opacity with 12px backdrop blur. This creates a "frosted" effect that sits above the silk.
- **Active Layer:** Elements like the video player or primary buttons use "Breathing Glows" (box-shadows using `#ffd700` with high spread and low opacity) to signify priority and live state.
- **Z-Index Strategy:** Floating particles and "sparkles" exist on the highest and lowest layers to create an immersive 3D space.

## Shapes

The shape language is **Softly Structured**. 

- **Standard Containers:** Use `rounded-xl` (1.5rem / 24px) to feel modern and friendly.
- **Inputs & Buttons:** Use `rounded-xl` (0.75rem / 12px) to provide a distinct, clickable appearance.
- **Status Pills:** Use `rounded-full` for badges like "LIVE" or total view counts.
- **Borders:** Most containers feature a 1px "Ghost Border" (semi-transparent white) or a 2px "Breathing Gold" border for featured content.

## Components

### Buttons
Primary buttons use a gold-to-orange linear gradient with a high-contrast label. They should feature an `active:scale-95` transition and a gold outer glow.

### Input Fields
Inputs are semi-transparent (`bg-white/10`) with white borders. On focus, the border transitions to solid gold. Placeholders should be low-opacity white.

### Glass Cards
The primary container for information. Must include `backdrop-blur-xl`, a 1px white/20 border, and a subtle 4px left-accent border in gold for "featured" items in a list.

### Bullet Curtain (Danmu)
Dynamic text elements that float across the screen. They should be encapsulated in a semi-transparent black capsule with a gold border to ensure legibility against a moving video background.

### Live Indicator
A pill-shaped badge with a pulsing red dot. The dot uses a primary-color shadow glow to simulate a physical LED light.