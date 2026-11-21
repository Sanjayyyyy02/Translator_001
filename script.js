// Frontend logic: fills the language dropdown, sends text to the Python API,
// and shows the translation, BLEU score, or an error message.

const textBox = document.getElementById("text");
const langSelect = document.getElementById("language");
const refBox = document.getElementById("reference");
const button = document.getElementById("translate-btn");
const errorBox = document.getElementById("error");
const resultBox = document.getElementById("result");
const output = document.getElementById("output");
const bleuBox = document.getElementById("bleu");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  resultBox.hidden = true;
}

// Fetch the 10 supported languages from the backend and fill the dropdown
async function loadLanguages() {
  try {
    const res = await fetch("/api/languages");
    const languages = await res.json();
    for (const name of languages) {
      langSelect.add(new Option(name, name));
    }
  } catch {
    showError("Could not reach the translator server. Is app.py running?");
  }
}

// Send the form to /api/translate and display the response
async function translate() {
  errorBox.hidden = true;
  button.disabled = true;
  button.textContent = "Translating...";

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: textBox.value,
        language: langSelect.value,
        reference: refBox.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Something went wrong.");
      return;
    }

    output.textContent = data.translation;
    if (data.bleu !== undefined) {
      bleuBox.textContent = `BLEU score: ${data.bleu} (${data.interpretation})`;
      bleuBox.hidden = false;
    } else {
      bleuBox.hidden = true;
    }
    resultBox.hidden = false;
  } catch {
    showError("Could not reach the translator server. Is app.py running?");
  } finally {
    button.disabled = false;
    button.textContent = "Translate";
  }
}

button.addEventListener("click", translate);
loadLanguages();
