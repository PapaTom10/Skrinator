
import React, { useRef, useEffect, useState } from 'react';
import { Camera as CameraIcon, X, RotateCcw } from 'lucide-react';

interface CameraProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

const Camera: React.FC<CameraProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' }, 
          audio: false 
        });
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
    startCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      onCapture(dataUrl.split(',')[1]); // Send just the base64 part
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4">
        <button onClick={onClose} className="text-white">
          <X className="w-8 h-8" />
        </button>
        <span className="text-white font-medium">Vyfoťte skříň</span>
        <div className="w-8" />
      </div>
      
      <div className="flex-1 relative overflow-hidden bg-gray-900 flex items-center justify-center">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="max-h-full max-w-full object-contain"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="p-8 flex justify-center items-center bg-black/50 backdrop-blur-md">
        <button 
          onClick={capture}
          className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform border-4 border-gray-300"
        >
          <div className="w-16 h-16 rounded-full border-2 border-black/10" />
        </button>
      </div>
    </div>
  );
};

export default Camera;
