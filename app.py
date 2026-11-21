"""English -> Indian language translator.

Backend: Flask API + NLLB-200 (encoder-decoder transformer) + NLTK.
Frontend: index.html, script.js, and style.css in the project root.
"""
import nltk
from flask import Flask, jsonify, request
from nltk.tokenize import sent_tokenize
from nltk.translate.bleu_score import SmoothingFunction, sentence_bleu
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "facebook/nllb-200-distilled-600M"
MAX_CHARS = 5000

# Dropdown label -> NLLB language code
LANGUAGES = {
    "Hindi": "hin_Deva", "Tamil": "tam_Taml", "Telugu": "tel_Telu",
    "Kannada": "kan_Knda", "Malayalam": "mal_Mlym", "Marathi": "mar_Deva",
    "Bhojpuri": "bho_Deva", "Bengali": "ben_Beng", "Gujarati": "guj_Gujr",
    "Punjabi": "pan_Guru",
}

# ---------- Setup (runs once at startup) ----------
try:  # NLTK sentence-splitter data; downloaded only if missing
    nltk.data.find("tokenizers/punkt_tab")
except LookupError:
    nltk.download("punkt_tab")

# Encoder reads the English tokens, decoder generates the target-language tokens
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, src_lang="eng_Latn")
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)

# The frontend files live beside app.py, so serve assets from the project root.
app = Flask(__name__, static_folder=".", static_url_path="")


# ---------- NLP functions ----------
def translate(text, lang_code):
    """Split paragraph into sentences, translate them as one batch, rejoin."""
    sentences = sent_tokenize(text)
    inputs = tokenizer(sentences, return_tensors="pt", padding=True,
                       truncation=True, max_length=256)
    outputs = model.generate(
        **inputs,
        # Forces the decoder's first token to be the target language tag
        forced_bos_token_id=tokenizer.convert_tokens_to_ids(lang_code),
        num_beams=4,       # beam search: keeps 4 candidate translations
        max_length=256,
    )
    return " ".join(tokenizer.batch_decode(outputs, skip_special_tokens=True))


def bleu_score(reference, hypothesis):
    """Sentence BLEU (0-100) with smoothing, since sentences are short."""
    smooth = SmoothingFunction().method4
    return 100 * sentence_bleu([reference.split()], hypothesis.split(),
                               smoothing_function=smooth)


def interpret_bleu(score):
    """Plain-language meaning of a BLEU score."""
    if score > 60:
        return "Excellent translation quality"
    if score > 30:
        return "Good translation; understandable"
    if score > 10:
        return "Basic translation; needs improvement"
    return "Weak translation; many words differ from the reference"


# ---------- Routes ----------
@app.route("/")
def home():
    return app.send_static_file("index.html")


@app.route("/api/languages")
def languages():
    return jsonify(list(LANGUAGES))


@app.route("/api/translate", methods=["POST"])
def translate_route():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    language = data.get("language")
    reference = (data.get("reference") or "").strip()

    # Error handling: empty input, unsupported language, oversized input
    if not text:
        return jsonify(error="Please enter some English text."), 400
    if language not in LANGUAGES:
        return jsonify(error=f"Unsupported language: {language}"), 400
    if len(text) > MAX_CHARS:
        return jsonify(error=f"Text too long (max {MAX_CHARS} characters)."), 400

    try:
        translated = translate(text, LANGUAGES[language])
    except Exception as exc:  # model/runtime failure
        return jsonify(error=f"Translation failed: {exc}"), 500

    result = {"translation": translated}
    if reference:  # BLEU only when the user gives a reference translation
        score = bleu_score(reference, translated)
        result["bleu"] = round(score, 2)
        result["interpretation"] = interpret_bleu(score)
    return jsonify(result)


if __name__ == "__main__":
    # 0.0.0.0 lets a phone on the same Wi-Fi/hotspot reach this server
    app.run(host="0.0.0.0", port=5000)
