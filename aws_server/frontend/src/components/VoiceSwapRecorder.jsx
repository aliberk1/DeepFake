import React, { useState, useRef } from 'react';

export default function VoiceSwapRecorder({ remoteStream, targetVoice }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const localAudioStreamRef = useRef(null);

  const startRecording = async () => {
    if (!remoteStream) {
      alert('Hata: Kaydedilecek canlı yayın akışı bulunamadı.');
      return;
    }
    if (!targetVoice) {
      alert('Hata: Lütfen yan menüden bir "Ses Modeli" seçin.');
      return;
    }

    try {
      // 1. Kullanıcının mikrofonundan temiz sesi al
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioStreamRef.current = audioStream;

      // 2. remoteStream'in video track'ini al
      const videoTrack = remoteStream.getVideoTracks()[0];
      if (!videoTrack) {
        alert('Hata: Canlı yayında video track bulunamadı.');
        return;
      }

      // 3. İkisini birleştirip yeni bir MediaStream oluştur
      const combinedStream = new MediaStream([
        videoTrack,
        audioStream.getAudioTracks()[0]
      ]);

      // 4. MediaRecorder'ı başlat
      mediaRecorderRef.current = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        setIsProcessing(true);
        const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
        
        // Mikrofonu kapat
        if (localAudioStreamRef.current) {
          localAudioStreamRef.current.getTracks().forEach(t => t.stop());
        }

        // Backend'e gönder
        await uploadAndProcess(videoBlob);
      };

      mediaRecorderRef.current.start(1000); // Her saniyede bir chunk at
      setIsRecording(true);

    } catch (err) {
      console.error('Kayıt başlatılamadı:', err);
      alert('Mikrofona erişilemedi veya kayıt başlatılamadı.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAndProcess = async (videoBlob) => {
    const formData = new FormData();
    formData.append('video', videoBlob, 'recording.webm');
    formData.append('target_voice', targetVoice);

    try {
      const res = await fetch('http://localhost:8001/api/process-video-voice', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Sunucu hatası: ' + res.status);
      }

      // Dosya olarak indir
      const processedBlob = await res.blob();
      if (processedBlob.type === 'application/json') {
          // Gelen data JSON ise, bir hata mesajı döndürülmüştür
          const errText = await processedBlob.text();
          const errJson = JSON.parse(errText);
          throw new Error(errJson.error || "Bilinmeyen hata");
      }

      const downloadUrl = window.URL.createObjectURL(processedBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `deepfake_video_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

    } catch (err) {
      console.error('İşleme hatası:', err);
      alert('Video işlenirken hata oluştu: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>🎙️ Yüz & Ses Kayıt Stüdyosu</h3>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>
          Canlı görüntünüzü ve mikrofon sesinizi birleştirerek hedef seste kaydeder.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {isProcessing && (
          <span style={{ fontSize: '0.85rem', color: 'var(--clr-primary)' }}>
            ⏳ Yapay Zeka İşliyor...
          </span>
        )}

        {!isRecording ? (
          <button 
            className="btn btn--primary" 
            onClick={startRecording}
            disabled={isProcessing || !targetVoice}
            style={{ width: '140px' }}
          >
            {isProcessing ? 'Lütfen Bekleyin' : '🔴 Kaydı Başlat'}
          </button>
        ) : (
          <button 
            className="btn btn--danger" 
            onClick={stopRecording}
            style={{ width: '140px', animation: 'pulse 2s infinite' }}
          >
            ⏹ Kaydı Bitir
          </button>
        )}
      </div>
    </div>
  );
}