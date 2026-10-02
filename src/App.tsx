import { ChevronRight, Hexagon } from 'lucide-react';
import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import './index.css';

const HERO_VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260729_102822_0e6c87e8-c141-4744-bf32-ad30db296371.mp4';
const PORTRAIT_URL = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260728_050334_5b076e26-0ce7-4898-b432-d764190e448f.png&w=1280&q=85';

type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
  href?: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function Reveal({ children, delay = 0, className = '', as: Tag = 'div', href }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      href={href}
      className={`${className} transition-all duration-700 ease-out will-change-transform ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, cw: number, ch: number) {
  const scale = Math.max(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
}

function ScrollVideo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visibleVideoRef = useRef<HTMLVideoElement | null>(null);
  const cacheRef = useRef<ImageBitmap[]>([]);
  const frameSizeRef = useRef({ width: 0, height: 0 });
  const [videoReady, setVideoReady] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    let raf = 0;
    let smoothed = 0;
    let target = 0;
    let lastSeek = -1;
    let disposed = false;

    const canvas = canvasRef.current;
    const video = visibleVideoRef.current;
    if (!canvas || !video) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const updateTarget = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      target = clamp(window.scrollY / maxScroll);
    };

    const tick = () => {
      if (disposed) return;
      resize();
      updateTarget();
      smoothed += (target - smoothed) * 0.12;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const frames = cacheRef.current;
        if (frames.length) {
          const index = Math.min(frames.length - 1, Math.max(0, Math.round(smoothed * (frames.length - 1))));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const size = frameSizeRef.current;
          drawCover(ctx, frames[index], size.width || 960, size.height || 540, canvas.width, canvas.height);
        } else if (video.duration && video.readyState >= 2) {
          const time = smoothed * Math.max(0, video.duration - 0.05);
          if (Math.abs(time - lastSeek) > 0.04) {
            try {
              video.currentTime = time;
              lastSeek = time;
            } catch {
              // ignore browser seek edge-cases while metadata settles
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', updateTarget, { passive: true });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateTarget);
      cacheRef.current.forEach((bitmap) => bitmap.close());
      cacheRef.current = [];
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const extractFrames = async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (disposed) return;
      const offVideo = document.createElement('video');
      offVideo.crossOrigin = 'anonymous';
      offVideo.muted = true;
      offVideo.playsInline = true;
      offVideo.preload = 'auto';
      offVideo.src = HERO_VIDEO_URL;
      try {
        await new Promise<void>((resolve, reject) => {
          const fail = () => reject(new Error('metadata failed'));
          offVideo.addEventListener('loadedmetadata', () => resolve(), { once: true });
          offVideo.addEventListener('error', fail, { once: true });
          offVideo.load();
        });
        const duration = offVideo.duration || 8;
        const count = Math.min(90, Math.max(24, Math.round(duration * 12)));
        const sourceWidth = offVideo.videoWidth || 1920;
        const sourceHeight = offVideo.videoHeight || 1080;
        const targetWidth = Math.min(960, sourceWidth);
        const targetHeight = Math.round((targetWidth / sourceWidth) * sourceHeight);
        frameSizeRef.current = { width: targetWidth, height: targetHeight };
        const scratch = document.createElement('canvas');
        scratch.width = targetWidth;
        scratch.height = targetHeight;
        const scratchCtx = scratch.getContext('2d', { alpha: false });
        if (!scratchCtx) throw new Error('no scratch ctx');
        const frames: ImageBitmap[] = [];
        for (let i = 0; i < count && !disposed; i += 1) {
          const time = (i / Math.max(1, count - 1)) * Math.max(0, duration - 0.05);
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            offVideo.addEventListener('seeked', done, { once: true });
            offVideo.currentTime = time;
          });
          scratchCtx.drawImage(offVideo, 0, 0, targetWidth, targetHeight);
          frames.push(await createImageBitmap(scratch));
          if (i % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (!disposed && frames.length) {
          cacheRef.current = frames;
          setCacheReady(true);
        } else {
          frames.forEach((frame) => frame.close());
        }
      } catch {
        // visible-video seeking remains the fallback path
      }
    };

    if (videoReady) void extractFrames();
    return () => {
      disposed = true;
    };
  }, [videoReady]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
      <img
        src="/hero-poster.jpg"
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${videoReady || cacheReady ? 'opacity-0' : 'opacity-100'}`}
      />
      <video
        ref={visibleVideoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${videoReady && !cacheReady ? 'opacity-100' : 'opacity-0'}`}
        src={HERO_VIDEO_URL}
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        onLoadedData={() => setVideoReady(true)}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${cacheReady ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
}

const navLinks = [
  { label: 'Projects', sup: '6' },
  { label: 'About' },
  { label: 'Blog' },
  { label: 'Contact' },
];

function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/15">
      <nav className="flex items-center justify-between px-5 py-4 sm:px-8 md:px-12">
        <Reveal delay={0} className="flex items-center gap-2.5 text-white drop-shadow-md" as="a" href="#">
          <Hexagon size={24} strokeWidth={1.5} />
          <span className="text-lg font-medium tracking-tight sm:text-xl">novaai</span>
        </Reveal>
        <div className="hidden items-center gap-8 md:flex lg:gap-10">
          {navLinks.map((link, index) => (
            <Reveal key={link.label} delay={100 + index * 100} as="a" className="text-sm text-white/85 drop-shadow-md transition-colors duration-300 hover:text-white" href="#">
              {link.label}
              {link.sup ? <sup className="ml-1 align-super font-mono text-[10px] text-white/60">{link.sup}</sup> : null}
            </Reveal>
          ))}
        </div>
        <Reveal
          delay={500}
          as="a"
          className="rounded-md border border-white/20 bg-white/15 px-4 py-2 text-xs text-white backdrop-blur-md drop-shadow-md transition-colors duration-300 hover:bg-white/25 sm:px-5 sm:text-sm"
          href="#"
        >
          Get Free Consultation
        </Reveal>
      </nav>
    </header>
  );
}

function LeftAccentBadge({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <Reveal delay={delay} className={`inline-flex border-l-2 border-white bg-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-white backdrop-blur-md drop-shadow-md ${className}`}>
      {children}
    </Reveal>
  );
}

function HeroSection() {
  const services = ['/ AI AUTOMATION', '/ AI INTEGRATION', '/ AI AGENT DEVELOPMENT'];
  return (
    <section className="flex min-h-screen flex-col justify-between px-5 pb-12 pt-24 supports-[height:100svh]:min-h-[100svh] sm:px-8 sm:pt-28 md:px-12 md:pb-16">
      <div className="flex flex-col justify-between gap-8 sm:flex-row">
        <div className="flex flex-col gap-2">
          {services.map((service, index) => (
            <Reveal key={service} delay={150 + index * 120} className="font-mono text-xs uppercase tracking-[0.15em] text-white/90 drop-shadow-md">
              {service}
            </Reveal>
          ))}
        </div>
        <Reveal delay={300} className="max-w-xs text-lg leading-relaxed text-white drop-shadow-md sm:text-right sm:text-xl">
          We design automation that brings clarity, precision, and efficiency to the way your company operates.
        </Reveal>
      </div>

      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div>
          <LeftAccentBadge delay={150} className="mb-5">We Automate 100+ Businesses</LeftAccentBadge>
          <Reveal delay={280} as="h1" className="text-5xl font-normal leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
            Clear. Precise.<br />
            Automated.
          </Reveal>
        </div>
        <Reveal delay={420} className="flex items-center gap-4 rounded-xl bg-white/15 p-3 backdrop-blur-md drop-shadow-lg">
          <img src={PORTRAIT_URL} alt="Mitha, co-founder of NovaAI." className="h-24 w-20 rounded-lg object-cover" />
          <div className="flex flex-col gap-1.5 pr-2">
            <p className="text-sm font-medium text-white">Talk with Mitha</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">Co-founder of NovaAI</p>
            <a href="#" className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors duration-300 hover:bg-white/85">
              Book 15-mins call <ChevronRight size={14} />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CapabilitySection() {
  const rows = [
    ['01', 'Real-time vision', 'Reads context as it happens and surfaces what matters before you ask.'],
    ['02', 'Layered insight', 'Moves from rough outline to sharp output without losing the thread.'],
    ['03', 'Adaptive speed', 'Learns your cadence and tightens every pass as you work.'],
  ];
  return (
    <section className="flex min-h-screen flex-col justify-between px-5 pb-12 pt-24 supports-[height:100svh]:min-h-[100svh] sm:px-8 sm:pt-28 md:px-12 md:pb-16">
      <div className="flex flex-col justify-between gap-8 sm:flex-row">
        <LeftAccentBadge delay={120}>Insight On Demand</LeftAccentBadge>
        <Reveal delay={220} className="max-w-sm text-lg leading-relaxed text-white drop-shadow-md sm:text-right sm:text-xl">
          Our AI doesn&apos;t just respond — it interprets, sharpens, and delivers the signal you need.
        </Reveal>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-12 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <Reveal delay={180} as="h2" className="text-5xl font-normal leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
            Learn to see<br />
            brilliantly.
          </Reveal>
          <Reveal delay={320} className="mt-6 max-w-md text-sm text-white/80 drop-shadow-md sm:text-base">
            From the first sketch to the final render, Nova turns raw intent into decisions your team can act on — quietly, precisely, at speed.
          </Reveal>
          <Reveal delay={420} className="mt-8 flex flex-wrap gap-3">
            <a href="#" className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition-colors duration-300 hover:bg-white/85 sm:text-sm">
              Run the demo <ChevronRight size={14} />
            </a>
            <a href="#" className="inline-flex rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-xs font-medium text-white backdrop-blur-md transition-colors duration-300 hover:bg-white/20 sm:text-sm">
              Free consultation
            </a>
          </Reveal>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/10 px-5 backdrop-blur-md sm:px-6">
          {rows.map(([index, title, body], i) => (
            <Reveal key={index} delay={300 + i * 110} className={`group flex gap-5 py-5 ${i < rows.length - 1 ? 'border-b border-white/15' : ''}`}>
              <span className="font-mono text-[11px] tracking-[0.15em] text-white/55">{index}</span>
              <div>
                <h3 className="flex items-center gap-2 text-base font-medium text-white sm:text-lg">
                  {title}
                  <ChevronRight size={16} className="text-white/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-white" />
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function App() {
  return (
    <div className="relative min-h-screen bg-[#0a0a0a] text-white">
      <ScrollVideo />
      <div className="relative z-10">
        <Navbar />
        <main>
          <HeroSection />
          <div className="h-[80vh]" aria-hidden="true" />
          <CapabilitySection />
        </main>
      </div>
    </div>
  );
}

export default App;
