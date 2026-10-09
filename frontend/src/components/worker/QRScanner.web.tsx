import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import jsQR from 'jsqr';

type Props = { onScan: (data: string) => void | Promise<void>; onClose: () => void };
export function QRScanner({ onScan, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const callback = useRef(onScan);
  callback.current = onScan;
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  const submit = async (data: string) => {
    if (busy.current) return;
    busy.current = true; setScanned(true);
    try { await callback.current(data); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Unable to process this QR code.'); }
    finally { busy.current = false; }
  };
  const start = async () => {
    setError(''); stop();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS or localhost. You can upload a QR image below.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!mounted.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      setScanned(false); setRunning(true);
    } catch (e) {
      stop(); setRunning(false);
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, then retry, or upload a QR image.' : e instanceof Error ? e.message : 'Camera unavailable. Try uploading a QR image.');
    }
  };
  useEffect(() => {
    if (!running || scanned) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const interval = setInterval(() => {
      const frame = video.current;
      if (!context || !frame?.videoWidth || busy.current) return;
      canvas.width = Math.min(frame.videoWidth, 960);
      canvas.height = Math.round(frame.videoHeight * canvas.width / frame.videoWidth);
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (code?.data) void submit(code.data);
    }, 250);
    return () => clearInterval(interval);
  }, [running, scanned]);
  const upload = async (file?: File) => {
    if (!file || busy.current) return;
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const picture = new window.Image();
      picture.src = url; await picture.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(picture.width, picture.height));
      canvas.width = Math.round(picture.width * scale); canvas.height = Math.round(picture.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image decoding is unavailable.');
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (!code?.data) throw new Error('No QR code found. Choose a clear, complete QR image.');
      await submit(code.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to read this image.'); }
    finally { URL.revokeObjectURL(url); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: '#111827' }} contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
    <View style={{ width: '100%', maxWidth: 640, gap: 16 }}>
      <View className="flex-row justify-between items-center"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xl font-bold">Scan worker QR</Text><Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel="Close QR scanner" onPress={onClose} className="p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white">Close</Text></Pressable></View>
      <video ref={video} muted playsInline aria-label="QR camera preview" style={{ width: '100%', maxHeight: '55vh', minHeight: 160, background: '#000', borderRadius: 12 }} />
      {!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} accessibilityRole="alert" className="text-orange-300">{error}</Text>}
      {!running && <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={start} className="bg-brand-orange p-4 rounded-xl"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center font-bold">Start camera</Text></Pressable>}
      {scanned && <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => { if (!busy.current) setScanned(false); }} className="bg-brand-orange p-4 rounded-xl"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center">Scan again</Text></Pressable>}
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white">Point the camera at the worker QR code, or choose a QR image.</Text>
      <input aria-label="Upload worker QR image" type="file" accept="image/*" style={{ color: '#fff', maxWidth: '100%' }} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
    </View>
  </ScrollView>;
}
