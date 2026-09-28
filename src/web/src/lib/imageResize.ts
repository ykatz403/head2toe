/** Reads an image's pixel dimensions without loading it into a canvas. */
export async function getImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

/** Shrinks an image to fit within maxSide (keeping aspect ratio) and returns it as a same-size Blob. */
export async function resizeToBlob(file: Blob, maxSide = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.9)
    })
  } finally {
    bitmap.close()
  }
}

/** Shrinks an image to fit within maxSide (keeping aspect ratio) and returns it as a data: URI. */
export async function toDataUri(file: Blob, maxSide = 1024): Promise<string> {
  const blob = await resizeToBlob(file, maxSide)
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(blob)
  })
}
