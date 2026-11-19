import { useState, useEffect, useCallback, useRef } from 'react';
import { Photo, PhotoSource } from '../types/photos';
import { getPhotos } from '../api/photos';

interface UsePhotosReturn {
  currentPhoto: Photo | null;
  nextPhoto: () => void;
  previousPhoto: () => void;
  isActive: boolean;
  setActive: (active: boolean) => void;
  photoCount: number;
  currentIndex: number;
}

const DEFAULT_INTERVAL = 30; // seconds

export function usePhotos(
  sources: PhotoSource[] = ['ha_media', 'local'],
  intervalSeconds: number = DEFAULT_INTERVAL,
): UsePhotosReturn {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setActive] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadRef = useRef<HTMLImageElement | null>(null);

  // Refresh before signed URLs expire and discover newly uploaded photos.
  useEffect(() => {
    let cancelled = false;

    let refreshTimer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await getPhotos(sources);
        if (!cancelled) {
          setPhotos(result);
          setCurrentIndex((index) => result.length ? index % result.length : 0);
        }
      } catch (error) {
        console.error(error);
      } finally {
        // Schedule after completion so slow HA requests cannot pile up.
        if (!cancelled) refreshTimer = setTimeout(refresh, 60_000);
      }
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(refreshTimer); };
  }, [sources.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload the next photo for smooth transitions
  useEffect(() => {
    if (photos.length < 2) return;
    const nextIdx = (currentIndex + 1) % photos.length;
    const img = new Image();
    img.src = photos[nextIdx].url;
    preloadRef.current = img;
  }, [currentIndex, photos]);

  // Auto-cycle timer
  useEffect(() => {
    if (!isActive || photos.length < 2) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, intervalSeconds * 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, photos.length, intervalSeconds]);

  const nextPhoto = useCallback(() => {
    if (photos.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const previousPhoto = useCallback(() => {
    if (photos.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const currentPhoto = photos.length > 0 ? photos[currentIndex] : null;

  return {
    currentPhoto,
    nextPhoto,
    previousPhoto,
    isActive,
    setActive,
    photoCount: photos.length,
    currentIndex,
  };
}
