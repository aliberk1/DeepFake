import asyncio
from modules.voice_conversion import convert_voice_rvc

async def main():
    # Use any existing small audio file as input
    input_audio = "tts_service/references/kayit_1.wav"
    target_voice = "kalinsemicenk"
    output_audio = "test_output.wav"
    
    print(f"Testing RVC with voice: {target_voice}")
    success = await convert_voice_rvc(input_audio, target_voice, output_audio)
    print(f"Result: {success}")

if __name__ == "__main__":
    asyncio.run(main())
