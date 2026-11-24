const element = id => document.getElementById(id);
const sourceForm = element("source-form");
const targetForm = element("target-form");
const sourceFile = element("source-file");
const chooseSourceFile = element("choose-source-file");
const sourceFileState = element("source-file-state");
const sourceTag = element("source-tag");
const targetTag = element("target-tag");
const saveButton = element("save-source");
const forgetButton = element("forget-source");
const changeButton = element("change-source");
const cancelButton = element("cancel-source");
const sourceMessage = element("source-message");
const targetMessage = element("target-message");
const guideCount = new Intl.NumberFormat();
const storageName = "guide-rebuilder:" + location.pathname.replace(/index\.html$/, "");
let database;
let source;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(storageName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("setup");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Browser storage is busy."));
  });
  return database;
}

async function accessStorage(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("setup", mode);
    const request = operation(transaction.objectStore("setup"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage is unavailable."));
  });
}

function message(node, text = "", kind = "") {
  node.textContent = text;
  node.dataset.kind = kind;
}

function showForm(editingSource) {
  element("startup").hidden = true;
  sourceForm.hidden = !editingSource;
  targetForm.hidden = editingSource;
  cancelButton.hidden = !source;
  element("saved-source").hidden = !source;
  if (source) {
    const guides = source.bundle.count === 1 ? "guide" : "guides";
    const scope = source.saved ? "" : " · This visit only";
    element("saved-details").textContent =
      `${guideCount.format(source.bundle.count)} ${guides}${scope}`;
  }
}

function resetSourceForm() {
  sourceForm.reset();
  sourceFileState.textContent = "No file selected";
}

chooseSourceFile.addEventListener("click", () => sourceFile.click());
sourceFile.addEventListener("change", () => {
  sourceFileState.textContent = sourceFile.files.length ? "File selected" : "No file selected";
});

sourceForm.addEventListener("submit", async event => {
  event.preventDefault();
  const file = sourceFile.files[0];
  if (!file) {
    message(sourceMessage, "Choose an original import file.", "error");
    chooseSourceFile.focus();
    return;
  }
  chooseSourceFile.disabled = true;
  saveButton.disabled = true;
  changeButton.disabled = true;
  cancelButton.disabled = true;
  forgetButton.disabled = true;
  message(sourceMessage, "Checking the original guide…");
  try {
    const tag = GuideImport.battleTag(sourceTag.value);
    const bundle = await GuideImport.open(file, tag);
    let saved = true;
    try {
      await accessStorage("readwrite", store => store.put({ file, tag }, "source"));
    } catch {
      saved = false;
    }
    source = { tag, bundle, saved };
    resetSourceForm();
    showForm(false);
    message(targetMessage, saved ? "" : "Browser storage is unavailable. The original guide is ready for this visit.");
    targetTag.focus();
  } catch (error) {
    message(sourceMessage, error.message, "error");
  } finally {
    chooseSourceFile.disabled = false;
    saveButton.disabled = false;
    changeButton.disabled = false;
    cancelButton.disabled = false;
    forgetButton.disabled = false;
  }
});

changeButton.addEventListener("click", () => {
  sourceTag.value = source.tag;
  message(sourceMessage);
  showForm(true);
  chooseSourceFile.focus();
});

cancelButton.addEventListener("click", () => {
  resetSourceForm();
  showForm(false);
  targetTag.focus();
});

forgetButton.addEventListener("click", async () => {
  forgetButton.disabled = true;
  changeButton.disabled = true;
  saveButton.disabled = true;
  try {
    if (source.saved) await accessStorage("readwrite", store => store.delete("source"));
    source = undefined;
    resetSourceForm();
    targetForm.reset();
    message(sourceMessage, "Original guide removed from this browser.");
    showForm(true);
    chooseSourceFile.focus();
  } catch {
    message(sourceForm.hidden ? targetMessage : sourceMessage,
      "Browser storage is unavailable. Try removing the guide again after reloading.", "error");
  } finally {
    forgetButton.disabled = false;
    changeButton.disabled = false;
    saveButton.disabled = false;
  }
});

targetForm.addEventListener("submit", event => {
  event.preventDefault();
  try {
    const tag = GuideImport.battleTag(targetTag.value);
    const rebuilt = GuideImport.rebuild(source.bundle, tag);
    const url = URL.createObjectURL(new Blob([rebuilt], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = GuideImport.fileName(tag);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(targetMessage, `Download started for ${tag}.`, "success");
  } catch (error) {
    message(targetMessage, error.message, "error");
  }
});

async function start() {
  try {
    const saved = await accessStorage("readonly", store => store.get("source"));
    if (saved) {
      const bundle = await GuideImport.open(saved.file, saved.tag);
      source = { tag: saved.tag, bundle, saved: true };
    }
  } catch {
    message(sourceMessage, "We couldn’t load a saved guide. Choose the original file to continue.");
  }
  showForm(!source);
}

start();
