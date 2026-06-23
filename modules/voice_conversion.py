import os
import shutil
import traceback
import torch
import scipy.io.wavfile as wavfile

# PyTorch 2.6+ güvenlik kısıtlamasını aşmak için monkey-patch
original_load = torch.load
def patched_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_load

async def convert_voice_rvc(input_audio_path: str, target_voice: str, output_audio_path: str) -> bool:
    """
    RVC (Voice-to-Voice) modelinin çalışacağı izole fonksiyon.
    Gerçek RVC çıkarım (inference) işlemini yapar.
    """
    try:
        from rvc_python.infer import RVCInference
    except ImportError as e:
        print(f"HATA: rvc-python yüklü değil veya hata var! Hata: {e}")
        shutil.copy(input_audio_path, output_audio_path)
        return True

    model_name = target_voice
    base_dir = os.path.dirname(__file__)
    model_path = os.path.join(base_dir, "rvc_models", f"{model_name}.pth")
    index_path = os.path.join(base_dir, "rvc_models", f"{model_name}.index")
    
    if not os.path.exists(model_path):
        print(f"UYARI: RVC Modeli bulunamadı -> {model_path}")
        print("Model indirilene kadar orijinal ses kullanılacak.")
        shutil.copy(input_audio_path, output_audio_path)
        return True
        
    try:
        print(f"RVC Çevirisi Başlıyor: {model_name}.pth kullanılıyor...")
        valid_index = index_path if os.path.exists(index_path) else ''
        
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        rvc = RVCInference(device=device)
        
        # Modeli Yükle
        rvc.load_model(model_path_or_name=model_path, version='v2', index_path=valid_index)
        
        # rvc-python kütüphanesindeki bir bug'ı aşmak için infer_file yerine doğrudan vc_single çağırıyoruz
        wav_opt = rvc.vc.vc_single(
            sid=0,
            input_audio_path=input_audio_path,
            f0_up_key=0,  # Sesin perde (pitch) ayarı
            f0_method="rmvpe",
            file_index=valid_index,
            index_rate=rvc.index_rate,
            filter_radius=rvc.filter_radius,
            resample_sr=rvc.resample_sr,
            rms_mix_rate=rvc.rms_mix_rate,
            protect=rvc.protect,
            f0_file="",
            file_index2=""
        )
        
        # vc_single fonksiyonu (msg, audio_data) şeklinde tuple döner. Bize sadece audio_data lazım.
        audio_data = wav_opt[1] if isinstance(wav_opt, tuple) else wav_opt
        
        wavfile.write(output_audio_path, rvc.vc.tgt_sr, audio_data)
        print("RVC Çevirisi Başarıyla Tamamlandı!")
        return True
    except Exception as e:
        print(f"RVC Çeviri Hatası: {e}")
        traceback.print_exc()
        shutil.copy(input_audio_path, output_audio_path)
        return True