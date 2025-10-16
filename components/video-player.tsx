'use client';

import { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  kalturaId: string;
  partnerId: number;
  uiConfId: number;
  onPlayerReady?: (player: any) => void;
}

export function VideoPlayer({ kalturaId, partnerId, uiConfId, onPlayerReady }: VideoPlayerProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Load Kaltura Player script
    const script = document.createElement('script');
    script.src = `https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${uiConfId}`;
    script.async = true;
    
    script.onload = () => {
      // Wait for KalturaPlayer to be available
      const checkPlayer = setInterval(() => {
        if (typeof (window as any).KalturaPlayer !== 'undefined') {
          clearInterval(checkPlayer);
          initializePlayer();
        }
      }, 100);
    };

    document.body.appendChild(script);

    const initializePlayer = () => {
      try {
        const KalturaPlayer = (window as any).KalturaPlayer;
        
        const config = {
          targetId: 'kaltura-player-container',
          provider: {
            partnerId: partnerId,
            uiConfId: uiConfId,
          },
          playback: {
            audioLanguage: 'en',
          },
          ui: {
            locale: 'en',
          },
        };

        const player = KalturaPlayer.setup(config);
        
        const mediaInfo = {
          entryId: kalturaId,
        };

        player.loadMedia(mediaInfo).then(() => {
          console.log('Kaltura player loaded successfully');
          playerRef.current = player;
          onPlayerReady?.(player);
        });

      } catch (error) {
        console.error('Failed to initialize Kaltura player:', error);
      }
    };

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (err) {
          console.error('Error destroying player:', err);
        }
      }
    };
  }, [kalturaId, partnerId, uiConfId, onPlayerReady]);

  return (
    <div 
      id="kaltura-player-container" 
      ref={playerContainerRef}
      className="w-full h-full"
      style={{ aspectRatio: '16/9' }}
    />
  );
}

