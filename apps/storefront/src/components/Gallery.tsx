"use client"

import Image from "next/image"
import { useState } from "react"
import { useTranslations } from "next-intl"

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const t = useTranslations("product")
  const [i, setI] = useState(0)
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface">
        <Image src={images[i]} alt={alt} fill priority sizes="(min-width: 1100px) 640px, 100vw" className="object-cover" />
      </div>
      {images.length > 1 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {images.map((src, n) => (
            <li key={src + n}>
              <button
                type="button"
                onClick={() => setI(n)}
                aria-pressed={n === i}
                aria-label={t("showImage", { n: n + 1, total: images.length })}
                className="block overflow-hidden rounded-md border border-line outline-offset-1 aria-pressed:outline-2 aria-pressed:outline-brand focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                <Image src={src} alt="" width={72} height={56} className="h-14 w-[72px] object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
