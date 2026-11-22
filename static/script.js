// Frontend logic: load choices, call Flask, and make the result easy to use.

const form = document.getElementById("translation-form");
const textBox = document.getElementById("text");
const charCount = document.getElementById("char-count");
const langSelect = document.getElementById("language");
const roundtripCheck = document.getElementById("roundtrip-check");
const refBox = document.getElementById("reference");
const button = document.getElementById("translate-btn");
const translateLabel = document.getElementById("translate-label");
const clearButton = document.getElementById("clear-btn");
const errorBox = document.getElementById("error");
const resultBox = document.getElementById("result");
const output = document.getElementById("output");
const copyButton = document.getElementById("copy-btn");
const copyStatus = document.getElementById("copy-status");
const listenButton = document.getElementById("listen-btn");
const voiceNote = document.getElementById("voice-note");
const speechAudio = document.getElementById("speech-audio");
const confidenceBox = document.getElementById("confidence");
const secondsBox = document.getElementById("seconds");
const timeNote = document.getElementById("time-note");
const roundtripResult = document.getElementById("roundtrip-result");
const roundtripText = document.getElementById("roundtrip-text");
const roundtripBleu = document.getElementById("roundtrip-bleu");
const roundtripInterpretation = document.getElementById("roundtrip-interpretation");
const referenceResult = document.getElementById("reference-result");
const referenceBleu = document.getElementById("reference-bleu");
const referenceChrf = document.getElementById("reference-chrf");
const referenceInterpretation = document.getElementById("reference-interpretation");

const languageTags = {
  Hindi: "hi", Tamil: "ta", Telugu: "te", Kannada: "kn", Malayalam: "ml",
  Marathi: "mr", Bhojpuri: "bho", Bengali: "bn", Gujarati: "gu", Punjabi: "pa",
};

let voiceLanguages = null;
let lastTranslation = "";
let resultLanguage = "";
let audioUrl = null;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

// Turn a failed API response into a short message for the user.
async function getServerError(response, fallback) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function updateCharacterCount() {
  charCount.textContent = `${textBox.value.length.toLocaleString()} / 5,000`;
}

function setInterpretation(element, value) {
  const levels = ["Excellent", "Good", "Basic", "Weak"];
  const level = levels.includes(value) ? value : "";
  element.textContent = value || "Not available";
  element.dataset.level = level;
}

function updateVoiceControl() {
  const language = resultLanguage;

  if (!language || !lastTranslation) {
    listenButton.disabled = true;
    voiceNote.textContent = "Translate text first to make audio.";
    listenButton.title = "Translate text first to make audio.";
    return;
  }

  if (voiceLanguages === null) {
    listenButton.disabled = true;
    voiceNote.textContent = "Voice availability could not be checked.";
    listenButton.title = "Voice availability is unknown.";
    return;
  }

  if (voiceLanguages.includes(language)) {
    listenButton.disabled = false;
    voiceNote.textContent = `Offline voice is available for ${language}.`;
    listenButton.title = `Listen to the ${language} translation.`;
    return;
  }

  listenButton.disabled = true;
  voiceNote.textContent = `No offline voice is available for ${language}. Choose another voice language.`;
  listenButton.title = `Offline speech is unavailable for ${language}.`;
}

// Fill the language menu from Flask so it stays aligned with the backend.
async function loadLanguages() {
  try {
    const response = await fetch("/api/languages");
    if (!response.ok) {
      throw new Error(await getServerError(response, "Could not load languages."));
    }

    const languages = await response.json();
    if (!Array.isArray(languages) || languages.length === 0) {
      throw new Error("The server did not return any languages.");
    }

    langSelect.replaceChildren(new Option("Choose a language", ""));
    for (const name of languages) {
      langSelect.add(new Option(name, name));
    }
    langSelect.disabled = false;
    button.disabled = false;
    await loadVoices();
  } catch (error) {
    langSelect.disabled = true;
    button.disabled = true;
    showError(error instanceof TypeError
      ? "Could not reach the translator server. Is app.py running?"
      : error.message);
  }
}

// Voice support is separate from translation, so its failure does not block the form.
async function loadVoices() {
  try {
    const response = await fetch("/api/voices");
    if (!response.ok) {
      throw new Error("Voice list unavailable");
    }
    const languages = await response.json();
    voiceLanguages = Array.isArray(languages) ? languages : [];
  } catch {
    voiceLanguages = null;
  }
  updateVoiceControl();
}

function displayResults(data) {
  lastTranslation = data.translation || "";
  resultLanguage = langSelect.value;
  output.textContent = lastTranslation;
  output.lang = languageTags[resultLanguage] || "en";

  const confidence = Number(data.confidence);
  confidenceBox.textContent = Number.isFinite(confidence) ? `${confidence.toFixed(1)}%` : "—";

  const seconds = Number(data.seconds);
  secondsBox.textContent = Number.isFinite(seconds) ? `${seconds.toFixed(2)} seconds` : "—";

  const roundtrip = data.roundtrip;
  const hasRoundtrip = roundtrip && typeof roundtrip === "object";
  roundtripResult.hidden = !hasRoundtrip;
  timeNote.textContent = hasRoundtrip
    ? "Translation + consistency check"
    : "Translation only";
  if (hasRoundtrip) {
    roundtripText.textContent = roundtrip.text || "No back-translation was returned.";
    roundtripBleu.textContent = Number.isFinite(Number(roundtrip.bleu))
      ? `${Number(roundtrip.bleu).toFixed(2)} / 100`
      : "—";
    setInterpretation(roundtripInterpretation, roundtrip.interpretation);
  }

  if (data.bleu !== undefined && data.chrf !== undefined) {
    referenceBleu.textContent = `${Number(data.bleu).toFixed(2)} / 100`;
    referenceChrf.textContent = `${Number(data.chrf).toFixed(2)} / 100`;
    setInterpretation(referenceInterpretation, data.interpretation);
    referenceResult.hidden = false;
  } else {
    referenceResult.hidden = true;
  }

  updateVoiceControl();
  resultBox.hidden = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resultBox.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
}

// Send one translation request and keep the loading state in one place.
async function translate(event) {
  event.preventDefault();
  clearError();

  if (!textBox.value.trim()) {
    showError("Enter some English text to translate.");
    textBox.focus();
    return;
  }
  if (textBox.value.length > 5000) {
    showError("Please keep the text within 5,000 characters.");
    textBox.focus();
    return;
  }
  if (!langSelect.value) {
    showError("Choose a language before translating.");
    langSelect.focus();
    return;
  }

  resultBox.hidden = true;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  translateLabel.textContent = "Translating…";
  clearButton.disabled = true;

  const requestData = {
    text: textBox.value,
    language: langSelect.value,
    roundtrip: roundtripCheck.checked,
  };
  if (refBox.value.trim()) {
    requestData.reference = refBox.value.trim();
  }

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });
    if (!response.ok) {
      throw new Error(await getServerError(response, "Translation failed. Please try again."));
    }
    displayResults(await response.json());
  } catch (error) {
    showError(error instanceof TypeError
      ? "Could not reach the translator server. Is app.py running?"
      : error.message || "The server response could not be read.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    translateLabel.textContent = "Translate";
    clearButton.disabled = false;
  }
}

// Revoke temporary audio URLs when playback ends or the result is cleared.
function releaseAudio() {
  speechAudio.onended = null;
  speechAudio.onerror = null;
  speechAudio.pause();
  speechAudio.removeAttribute("src");
  speechAudio.load();
  speechAudio.hidden = true;
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
}

// Request speech only when the backend says this language has an offline voice.
async function listen() {
  if (listenButton.disabled || !lastTranslation || !resultLanguage) {
    return;
  }

  clearError();
  releaseAudio();
  listenButton.disabled = true;
  listenButton.textContent = "Preparing audio…";

  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lastTranslation, language: resultLanguage }),
    });
    if (!response.ok) {
      throw new Error(await getServerError(response, "Could not create speech audio."));
    }

    const audioBlob = await response.blob();
    if (!audioBlob.type.includes("audio")) {
      throw new Error("The server returned an audio file in an unexpected format.");
    }
    audioUrl = URL.createObjectURL(audioBlob);
    speechAudio.src = audioUrl;
    speechAudio.hidden = false;
    speechAudio.onended = releaseAudio;
    speechAudio.onerror = releaseAudio;
    await speechAudio.play();
  } catch (error) {
    showError(error instanceof TypeError
      ? "Could not reach the translator server. Is app.py running?"
      : error.message || "Speech playback failed. Use the audio controls to try again.");
  } finally {
    listenButton.textContent = "Listen";
    updateVoiceControl();
  }
}

// Copy text through the clipboard API, with a local fallback for older browsers.
async function copyTranslation() {
  if (!lastTranslation) {
    return;
  }

  try {
    if (!navigator.clipboard) {
      throw new Error("Clipboard access is unavailable");
    }
    await navigator.clipboard.writeText(lastTranslation);
  } catch {
    const temporaryBox = document.createElement("textarea");
    temporaryBox.value = lastTranslation;
    temporaryBox.style.position = "fixed";
    temporaryBox.style.left = "-9999px";
    document.body.appendChild(temporaryBox);
    temporaryBox.select();
    const copied = document.execCommand("copy");
    temporaryBox.remove();
    if (!copied) {
      copyStatus.textContent = "Copy failed. Select the translation and copy it manually.";
      return;
    }
  }

  copyButton.textContent = "Copied";
  copyStatus.textContent = "Translation copied.";
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1400);
}

function clearForm() {
  textBox.value = "";
  refBox.value = "";
  roundtripCheck.checked = false;
  updateCharacterCount();
  clearError();
  resultBox.hidden = true;
  referenceResult.hidden = true;
  lastTranslation = "";
  resultLanguage = "";
  copyStatus.textContent = "";
  copyButton.textContent = "Copy";
  releaseAudio();
  updateVoiceControl();
  textBox.focus();
}

textBox.addEventListener("input", updateCharacterCount);
form.addEventListener("submit", translate);
clearButton.addEventListener("click", clearForm);
listenButton.addEventListener("click", listen);
copyButton.addEventListener("click", copyTranslation);

// Ctrl+Enter is a quick submit shortcut while either text field is active.
for (const field of [textBox, refBox]) {
  field.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      form.requestSubmit();
    }
  });
}

loadLanguages();
updateCharacterCount();
