interface Props {
  streamUrl: string
  cameraId: string
  active: boolean
}

export function LivePreview({ streamUrl, cameraId, active }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-black">
      {active ? (
        <img
          key={cameraId}
          src={streamUrl}
          alt="Live preview kamera"
          className="aspect-video w-full object-contain"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center text-sm text-slate-600">
          Stream nonaktif
        </div>
      )}
    </div>
  )
}
