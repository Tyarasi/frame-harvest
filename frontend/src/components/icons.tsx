import type { SVGProps } from 'react'

function Base(props: SVGProps<SVGSVGElement>) {
  return {
    xmlns: 'http://www.w3.org/2000/svg' as const,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  }
}

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.6l1-1.6A1.5 1.5 0 0 1 9.4 4.6h5.2a1.5 1.5 0 0 1 1.3.8L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)} fill="currentColor" stroke="none">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)} fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.55 1.55M7.15 16.85 5.6 18.4M18.4 18.4l-1.55-1.55M7.15 7.15 5.6 5.6" />
    </svg>
  )
}

export function PowerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M12 3v8" />
      <path d="M7.4 5.4a8 8 0 1 0 9.2 0" />
    </svg>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function BoundingBoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2.5" />
      <rect x="7" y="8" width="8" height="9" rx="1" />
    </svg>
  )
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function CropIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  )
}

export function UndoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M4 10h9a5 5 0 0 1 0 10h-2" />
      <path d="M8 5.5 4 10l4 4.5" />
    </svg>
  )
}

export function ExpandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M9 3H4v5M15 3h5v5M9 21H4v-5M15 21h5v-5" />
    </svg>
  )
}

export function CollapseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
    </svg>
  )
}

export function CpuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...Base(props)}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
      <path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" />
    </svg>
  )
}
