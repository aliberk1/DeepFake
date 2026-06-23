# DeepFake Live — AI Tabanlı Yüz Değiştirme, Ses Klonlama ve Röportaj Simülasyonu

> WebRTC, InsightFace, XTTSv2, RVC, FastAPI ve React kullanılarak geliştirilen; eğlence, demo ve eğitim amacı taşıyan gerçek zamanlı deepfake etkileşim platformu.

## İçindekiler

- [Proje Özeti](#proje-özeti)
- [Önemli Etik Kullanım Notu](#önemli-etik-kullanım-notu)
- [Temel Özellikler](#temel-özellikler)
- [Sistem Mimarisi](#sistem-mimarisi)
- [Servisler ve Portlar](#servisler-ve-portlar)
- [Dosya Yapısı](#dosya-yapısı)
- [Kurulum](#kurulum)
- [Çalıştırma](#çalıştırma)
- [Ortam Değişkenleri](#ortam-değişkenleri)
- [Model ve Veri Gereksinimleri](#model-ve-veri-gereksinimleri)
- [API Endpointleri](#api-endpointleri)
- [Değerlendirme Metrikleri](#değerlendirme-metrikleri)
- [Sık Karşılaşılan Hatalar](#sık-karşılaşılan-hatalar)
- [Geliştirme Notları](#geliştirme-notları)

---

## Proje Özeti

Bu proje, kullanıcı kamerasından gelen görüntüyü WebRTC üzerinden GPU Worker servisine aktarır, seçilen kaynak yüz modeliyle gerçek zamanlı yüz değiştirme uygular ve işlenmiş video akışını tarayıcıya geri gönderir. Ayrıca kullanıcı metnini seçilen referans sese göre seslendirme, ses profili yükleme, video içindeki sesi RVC ile dönüştürme ve hazır röportaj/senaryo akışları üretme özellikleri içerir.

Proje dört ana servis etrafında çalışır:

| Servis | Port | Görev |
|---|---:|---|
| React Frontend | `5173` | Kullanıcı arayüzü, kamera/mikrofon, senaryo seçimi, kayıt ve oynatma |
| Signaling Server | `8000` | WebRTC için WebSocket tabanlı SDP/ICE sinyalizasyonu |
| GPU Worker | `8001` | Yüz değiştirme, WebRTC answer üretimi, TTS/RVC API köprüsü |
| TTS Microservice | `8002` | XTTSv2 ile metinden sese üretim |

---

## Önemli Etik Kullanım Notu

Bu proje yalnızca eğitim, araştırma, demo ve parodi/eğlence amaçlı kullanılmalıdır. Gerçek kişilerin yüzü veya sesi, açık izin alınmadan kullanılmamalıdır. Üretilen içeriklerin yapay zekâ ile üretildiği açıkça belirtilmelidir.

Projede güvenli kullanım için:

- İşlenmiş video karelerine `AI GENERATED - DEEPFAKE` filigranı eklenir.
- Ses ve yüz profilleri yalnızca izinli/temsili demo verilerinden oluşturulmalıdır.
- Üretilen içerikler kimlik taklidi, dolandırıcılık, yanıltma veya itibar zedeleme amacıyla kullanılmamalıdır.
- Demo sunumlarında sistemin gerçek kişi taklidi değil, yapay zekâ simülasyonu olduğu özellikle belirtilmelidir.

---

## Temel Özellikler

### 1. Gerçek Zamanlı Yüz Değiştirme

- WebRTC ile kamera akışı alma.
- InsightFace `FaceAnalysis` ile yüz algılama.
- `inswapper_128.onnx` modeli ile yüz değiştirme.
- CUDA öncelikli çalışma, uygun değilse CPU fallback.
- Kare işleme sırasında filigran ekleme.
- Ön tanımlı yüz seçenekleri: `face1`, `face2`, `face3`, ...

### 2. Ses Klonlama / Text-to-Speech

- XTTSv2 tabanlı çok dilli TTS servisi.
- `tts_service/references/` klasöründeki `.wav` referans sesleri otomatik listeleme.
- Konuşma hızı, pitch ve duygu parametreleri.
- Üretilen sesleri `outputs/` altında saklama.

### 3. Voice-to-Voice / RVC Dönüşümü

- Kayıtlı videodaki sesi çıkarma.
- `modules/rvc_models/` altındaki `.pth` ve `.index` model çiftiyle sesi dönüştürme.
- Yeni sesi video ile tekrar birleştirerek MP4 çıktısı üretme.
- Model bulunamazsa sistem hata vermeden orijinal sesi kullanarak fallback yapar.

### 4. Otomatik Röportaj ve Senaryo Modu

- İş görüşmesi parodisi.
- Komedi röportajı.
- Dostça tartışma.
- Motivasyon konuşması.
- Çoklu konuşmacı mantığıyla farklı ses profilleri kullanabilme.

### 5. Kayıt ve Ekran Paylaşımı

- Tarayıcı tarafında MediaRecorder ile toplantı/video kaydı.
- Ekran paylaşımı modülü.
- Asenkron modül yükleme yapısı.

### 6. Değerlendirme Metrikleri

- Ses kalitesi: MCD, SNR.
- Görüntü kalitesi: SSIM, PSNR.
- Sistem performansı: uçtan uca latency.

---

## Sistem Mimarisi

```text
Kullanıcı Tarayıcısı
React + Vite
Kamera / Mikrofon / Senaryo UI
        │
        │ WebSocket SDP/ICE
        ▼
Signaling Server :8000
FastAPI + WebSocket Relay
        │
        │ Offer / Answer / ICE
        ▼
GPU Worker :8001
FastAPI + aiortc + InsightFace + RVC Client
        │
        ├── WebRTC video yüz değiştirme
        ├── /api/voices
        ├── /api/upload-voice
        ├── /api/tts_only
        ├── /api/chat
        └── /api/process-video-voice
        │
        ▼
TTS Microservice :8002
XTTSv2 + PyTorch
```

---

## Servisler ve Portlar

| Servis | Dizin | Başlatma Komutu | Port |
|---|---|---|---:|
| Frontend | `aws_server/frontend` | `npm run dev` | `5173` |
| Signaling Server | `aws_server/signaling` | `uvicorn main:app --host 0.0.0.0 --port 8000` | `8000` |
| GPU Worker | `gpu_worker` | `uvicorn api:app --host 0.0.0.0 --port 8001` | `8001` |
| TTS Service | `tts_service` | `uvicorn tts_service:app --host 127.0.0.1 --port 8002` | `8002` |

---

## Dosya Yapısı

```text
DeepFake/
├── aws_server/
│   ├── frontend/              # React + Vite arayüzü
│   │   ├── src/
│   │   │   ├── App.jsx
│   │   │   ├── hooks/
│   │   │   ├── components/
│   │   │   └── modules/
│   │   └── package.json
│   └── signaling/             # FastAPI WebSocket signaling server
│       ├── main.py
│       ├── requirements.txt
│       └── Dockerfile
│
├── gpu_worker/                # Ana video/ses işleme servisi
│   ├── api.py
│   ├── rtc_worker.py
│   ├── requirements.txt
│   ├── start_worker.bat
│   └── start_ngrok.bat
│
├── tts_service/               # XTTSv2 mikroservisi
│   ├── tts_service.py
│   ├── requirements_tts.txt
│   ├── references/            # Referans .wav sesleri
│   └── SES_EKLEME_REHBERI.md
│
├── modules/
│   ├── face_swap.py           # InsightFace + InSwapper işlemleri
│   ├── voice_cloning.py       # TTS microservice client
│   ├── voice_conversion.py    # RVC voice-to-voice dönüşümü
│   ├── scenarios.py           # Hazır senaryo verileri
│   └── rvc_models/            # .pth + .index RVC modelleri
│
├── data/
│   ├── source_faces/          # face1.png, face2.png, ...
│   └── models/                # inswapper_128.onnx burada olmalı
│
├── evaluation/
│   └── metrics.py
│
├── outputs/                   # Üretilen ses/video/log çıktıları
├── web/                       # Legacy Socket.IO arayüzü
├── main.py                    # Alternatif ngrok-free worker modu
├── start.bat                  # Kök worker başlatma scripti
├── requirements.txt           # Eski/genel bağımlılıklar
└── .env.example
```

---

## Kurulum

### 1. Depoyu Klonla

```bash
git clone https://github.com/aliberk1/DeepFake.git
cd DeepFake
```

### 2. Python Ortamları

Bu projede farklı servislerin Python sürüm ve bağımlılık ihtiyaçları farklı olabilir. En sağlıklı kurulum için servis bazlı sanal ortam kullanılması önerilir.

#### GPU Worker

```bash
cd gpu_worker
python -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
cd ..
```

Ek olarak ana proje bağımlılıkları gerekirse:

```bash
pip install -r requirements.txt
```

#### Signaling Server

```bash
cd aws_server\signaling
python -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
cd ..\..
```

#### TTS Microservice

XTTSv2 için Python 3.10 önerilir.

```bash
cd tts_service
py -3.10 -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements_tts.txt
cd ..
```

#### Frontend

```bash
cd aws_server\frontend
npm install
cd ..\..
```

---

## Çalıştırma

Tüm servisleri ayrı terminal pencerelerinde başlatın.

### Terminal 1 — TTS Microservice

```bash
cd tts_service
venv\Scripts\activate
uvicorn tts_service:app --host 127.0.0.1 --port 8002
```

### Terminal 2 — GPU Worker

```bash
cd gpu_worker
venv\Scripts\activate
uvicorn api:app --host 0.0.0.0 --port 8001
```

### Terminal 3 — Signaling Server

```bash
cd aws_server\signaling
venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Terminal 4 — React Frontend

```bash
cd aws_server\frontend
npm run dev
```

Arayüz varsayılan olarak şu adreste açılır:

```text
http://localhost:5173
```

---

## Ortam Değişkenleri

Proje kökünde veya ilgili servis klasörlerinde `.env` dosyası oluşturun.

```env
# GPU Worker
GPU_WORKER_PORT=8001

# Signaling Server
GPU_WORKER_URL=http://127.0.0.1:8001

# React Frontend
VITE_SIGNALING_WS_URL=ws://localhost:8000

# Gemini / LLM cevabı kullanılacaksa
GEMINI_API_KEY=your_api_key_here
```

Canlı HTTPS ortamında frontend için `wss://...` kullanılmalıdır.

---

## Model ve Veri Gereksinimleri

### Yüz Değiştirme Modeli

`modules/face_swap.py` içinde `data/models/inswapper_128.onnx` beklenir. Büyük model dosyaları çoğu zaman repoya eklenmediği için bu dosya yerel olarak şu konuma koyulmalıdır:

```text
data/models/inswapper_128.onnx
```

### Kaynak Yüz Görselleri

Kaynak yüz görselleri şu dizindedir:

```text
data/source_faces/
```

Örnek adlandırma:

```text
face1.png
face2.png
face3.jpeg
face4.jpeg
...
```

Yeni yüz eklerken:

1. Görseli `data/source_faces/` içine koyun.
2. `modules/face_swap.py` içindeki `available_models` sözlüğüne ekleyin.
3. Frontend tarafındaki yüz listesine aynı `id` ile ekleyin.

### TTS Referans Sesleri

TTS için referans sesler şu dizindedir:

```text
tts_service/references/
```

Kurallar:

- `.wav` formatı kullanılmalı.
- Dosya adı küçük harf ve alt çizgi içermeli.
- Boşluk, Türkçe karakter ve özel karakter kullanılmamalı.
- Yalnızca izinli/temsili sesler kullanılmalı.

Örnek:

```text
kayit_1.wav
kayit_2.wav
demo_voice.wav
```

### RVC Model Dosyaları

Voice-to-voice dönüşüm için model dosyaları şu dizinde olmalıdır:

```text
modules/rvc_models/
```

Her ses modeli için iki dosya beklenir:

```text
model_adi.pth
model_adi.index
```

Örnek:

```text
modules/rvc_models/demo_voice.pth
modules/rvc_models/demo_voice.index
```

Frontend veya API tarafında `target_voice="demo_voice"` gönderildiğinde sistem aynı ada sahip `.pth` ve `.index` dosyalarını arar.

---

## API Endpointleri

### GPU Worker — `http://localhost:8001`

| Method | Endpoint | Açıklama |
|---|---|---|
| `GET` | `/health` | CUDA/GPU durumu ve aktif bağlantılar |
| `POST` | `/webrtc/offer` | WebRTC SDP offer alır, answer döner |
| `POST` | `/webrtc/ice` | ICE candidate ekler |
| `POST` | `/api/set-face-model/{client_id}` | Aktif yüz modelini değiştirir |
| `GET` | `/api/voices` | TTS `.wav` ve RVC `.pth` ses profillerini listeler |
| `POST` | `/api/upload-voice` | Mikrofon/yüklenen sesi WAV referansa dönüştürür |
| `POST` | `/api/chat` | Metin alır, kısa AI cevabı ve ses çıktısı üretir |
| `POST` | `/api/tts_only` | Girilen metni doğrudan seçilen sesle seslendirir |
| `GET` | `/api/scenarios` | Hazır senaryoları listeler |
| `POST` | `/api/scenario/opening` | Seçilen senaryo için açılış cümlesi üretir |
| `POST` | `/api/chat-scenario` | Senaryo bazlı AI cevabı ve ses üretir |
| `POST` | `/api/process-video-voice` | Videodaki sesi RVC ile değiştirip MP4 üretir |
| `GET` | `/outputs/{filename}` | Üretilen çıktı dosyasını sunar |

### Signaling Server — `http://localhost:8000`

| Method | Endpoint | Açıklama |
|---|---|---|
| `GET` | `/health` | Worker ve istemci bağlantı durumunu döndürür |
| `WS` | `/ws/signal/{client_id}` | React istemcisi için WebSocket sinyalizasyonu |
| `WS` | `/ws/worker` | Alternatif kalıcı GPU Worker bağlantısı |

### TTS Microservice — `http://localhost:8002`

| Method | Endpoint | Açıklama |
|---|---|---|
| `POST` | `/generate-audio/` | Metin + referans ses ile WAV üretir |

---

## Değerlendirme Metrikleri

`evaluation/metrics.py` içinde aşağıdaki metrikler bulunur:

| Metrik | Fonksiyon | Amaç |
|---|---|---|
| MCD | `calculate_mcd()` | Klonlanan ses ile referans ses arasındaki farkı ölçer |
| SNR | `calculate_snr()` | Ses sinyal/gürültü oranını hesaplar |
| SSIM | `calculate_ssim()` | Görüntü yapısal benzerliğini ölçer |
| PSNR | `calculate_psnr()` | Görüntü kalitesini piksel bazlı ölçer |
| Latency | `measure_latency()` | Uçtan uca gecikmeyi milisaniye cinsinden hesaplar |

---

## Sık Karşılaşılan Hatalar

### `inswapper_128.onnx bulunamadı`

`data/models/inswapper_128.onnx` dosyası eksiktir. `data/models/` klasörünü oluşturup modeli bu konuma yerleştirin.

### CUDA çalışmıyor

Aşağıdaki komutla kontrol edin:

```bash
python check_gpu.py
```

Ayrıca PyTorch, CUDA, cuDNN ve `onnxruntime-gpu` sürümlerinin uyumlu olduğundan emin olun.

### TTS servisi cevap vermiyor

`tts_service` ayrı bir servis olarak çalışmalıdır:

```bash
cd tts_service
venv\Scripts\activate
uvicorn tts_service:app --host 127.0.0.1 --port 8002
```

### `/api/voices` boş dönüyor

`tts_service/references/` içinde `.wav` referans ses yoksa veya `modules/rvc_models/` içinde `.pth` dosyası yoksa liste boş olabilir.

### RVC modeli bulunamadı

`modules/rvc_models/` içinde aynı isimli `.pth` ve `.index` dosyaları olmalıdır. `.pth` yoksa sistem fallback olarak orijinal sesi kullanır.

### WebRTC bağlantısı kurulmuyor

- `VITE_SIGNALING_WS_URL` değerini kontrol edin.
- Frontend ile signaling server aynı protokolü kullanmalı: local için `ws://`, canlı HTTPS için `wss://`.
- Simetrik NAT arkasında TURN sunucusu gerekebilir.

### Requirements dosyası hata veriyor

`requirements.txt` dosyalarında her bağımlılık ayrı satırda olmalıdır. Eğer kurulumda hata alınırsa ilgili servis klasöründeki requirements dosyasını satır satır düzenleyin.

---

## Geliştirme Notları

Bu README, mevcut proje yapısına göre şu eksikleri netleştirir:

- `start_all.bat` yerine mevcut `start.bat` ve manuel servis başlatma akışı anlatıldı.
- Yüz değiştirme için gerekli `inswapper_128.onnx` dosyasının repoda olmayabileceği belirtildi.
- RVC için `.pth` + `.index` model çifti gereksinimi açıklandı.
- Senaryo modülü, otomatik röportaj, TTS-only ve video ses dönüştürme endpointleri README'ye eklendi.
- Etik kullanım, filigran ve izinli veri kullanımı bölümü güçlendirildi.
- Kurulum komutlarındaki bozuk Windows path yazımları düzeltildi.

---

## Kısa Sunum Açıklaması

Bu proje, gerçek zamanlı video üzerinde yüz değiştirme ve metinden sese/sesten sese dönüşüm özelliklerini birleştiren yapay zekâ tabanlı bir deepfake etkileşim sistemidir. Kullanıcı, web arayüzü üzerinden kamera akışını başlatabilir, seçilen demo persona ile yüz değiştirme uygulayabilir, metni farklı referans seslerle seslendirebilir ve hazır röportaj senaryoları üzerinden eğlence amaçlı simülasyonlar oluşturabilir. Sistem, WebRTC tabanlı düşük gecikmeli video aktarımı, GPU hızlandırmalı yüz işleme, XTTSv2 tabanlı ses üretimi ve RVC tabanlı ses dönüşümü bileşenlerinden oluşur.
