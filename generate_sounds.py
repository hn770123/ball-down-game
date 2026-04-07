import wave
import struct
import math
import random

def generate_dobon(filename, pitch_factor=1.0):
    sample_rate = 44100
    duration = 0.5
    num_samples = int(sample_rate * duration)

    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(sample_rate)

        for i in range(num_samples):
            t = float(i) / sample_rate

            # Base frequency for the "thump"
            # Higher pitch_factor means higher frequency
            freq = 100 * pitch_factor * math.exp(-10 * t)

            # Bubble sound (sine wave with frequency sweep)
            value = math.sin(2 * math.pi * freq * t)

            # Add some harmonics for viscosity
            value += 0.5 * math.sin(2 * math.pi * freq * 2 * t)

            # Envelope (fade out)
            envelope = math.exp(-5 * t)

            # Scale to 16-bit range
            sample = int(value * envelope * 32767 * 0.5)
            wav_file.writeframes(struct.pack('<h', sample))

def generate_juwa(filename):
    sample_rate = 44100
    duration = 1.0
    num_samples = int(sample_rate * duration)

    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for i in range(num_samples):
            t = float(i) / sample_rate

            # White noise
            noise = random.uniform(-1, 1)

            # High-pass filter-ish effect (simple randomization tweak)
            # and frequency modulation to make it sound like "sizzle"
            sizzle = noise * (math.sin(2 * math.pi * 100 * t) * 0.5 + 0.5)

            # Fade out
            envelope = math.exp(-3 * t)

            sample = int(sizzle * envelope * 32767 * 0.3)
            wav_file.writeframes(struct.pack('<h', sample))

if __name__ == "__main__":
    import os
    os.makedirs('assets/sounds', exist_ok=True)

    print("Generating merge_high.wav...")
    generate_dobon('assets/sounds/merge_high.wav', pitch_factor=1.5)

    print("Generating merge_low.wav...")
    generate_dobon('assets/sounds/merge_low.wav', pitch_factor=0.7)

    print("Generating destroy.wav...")
    generate_juwa('assets/sounds/destroy.wav')

    print("Done!")
