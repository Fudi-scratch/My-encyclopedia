// ==========================================================
// 手作り百科事典 - アプリロジック
// データは localStorage に保存されます（このブラウザだけに残ります）
// ==========================================================

(function () {
  "use strict";

  const STORAGE_KEY = "html_css_js_dictionary_entries_v1";

  const SEED_ENTRIES = [
    {
      title: "<div>要素",
      category: "HTML",
      body:
        "意味を持たない、汎用のブロックレベル要素。それ自体に見た目や役割はなく、CSSでスタイルを当てたりJavaScriptで操作したりするための入れ物として使う。見出しや段落など、意味に合ったタグが他にある場合はそちらを優先するのが基本。",
    },
    {
      title: "<a>要素",
      category: "HTML",
      body:
        "ハイパーリンクを作るための要素。href属性にリンク先のURLを指定する。target=\"_blank\"を指定すると別タブで開き、外部サイトへのリンクではrel=\"noopener\"を添えることが推奨される。",
    },
    {
      title: "<img>要素",
      category: "HTML",
      body:
        "画像を表示するための要素。src属性に画像のパスを、alt属性に代替テキストを指定する。alt属性は画像が読み込めなかったときの表示や、スクリーンリーダーで内容を伝える際に重要な役割を持つ。",
    },
    {
      title: "display",
      category: "CSS",
      body:
        "要素がどのようにレイアウトされるかを決めるプロパティ。blockは幅いっぱいのブロック、inlineは文章の一部のように並ぶ要素、flexやgridは子要素を柔軟に並べるレイアウトを作る。値によって要素の振る舞いが大きく変わる、レイアウトの基本となるプロパティ。",
    },
    {
      title: "flexbox",
      category: "CSS",
      body:
        "親要素にdisplay: flexを指定して使う、要素を1方向に並べて揃えるためのレイアウト方式。justify-contentで主軸方向の揃え方を、align-itemsで交差軸方向の揃え方を指定でき、中央揃えや均等配置が少ないコードで実現できる。",
    },
    {
      title: "position",
      category: "CSS",
      body:
        "要素の配置方法を指定するプロパティ。staticが初期値で、relativeは元の位置を基準にずらせる。absoluteは直近のrelative（など）な祖先要素を基準に配置され、fixedは画面に固定、stickyはスクロールに応じて固定と通常配置を切り替える。",
    },
    {
      title: "addEventListener",
      category: "JavaScript",
      body:
        "要素にイベントの監視を追加するメソッド。第1引数にclickやkeydownなどのイベント名、第2引数に実行する関数を渡す。同じ要素に複数のリスナーを追加でき、onclickのようなプロパティへの代入と違って上書きされない。",
    },
    {
      title: "querySelector",
      category: "JavaScript",
      body:
        "CSSセレクタと同じ書き方で、条件に一致する最初の要素を取得するメソッド。document.querySelector(\".card\")のように使う。条件に一致する要素をすべて取得したいときはquerySelectorAllを使い、こちらはNodeListが返る。",
    },
    {
      title: "Promise",
      category: "JavaScript",
      body:
        "非同期処理の結果（成功か失敗か）を表すオブジェクト。処理が成功するとresolveが、失敗するとrejectが呼ばれ、thenやcatchでその結果を受け取れる。async/await構文を使うと、Promiseを使った処理を同期処理のような見た目で書くことができる。",
    },
  ];

  /** @type {{id:string, title:string, category:string, body:string, updatedAt:number}[]} */
  let entries = [];
  let view = { name: "home" }; // {name:'home'} | {name:'article', id} | {name:'form', mode:'add'|'edit', id?}
  let searchTerm = "";
  let activeLetter = null;
  let pendingDeleteId = null;

  const collator = new Intl.Collator("ja");

  // ---------------- Storage ----------------

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        entries = SEED_ENTRIES.map((e) => ({
          id: makeId(),
          title: e.title,
          category: e.category,
          body: e.body,
          updatedAt: Date.now(),
        }));
        saveEntries();
        return;
      }
      const parsed = JSON.parse(raw);
      entries = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("読み込みに失敗しました", err);
      entries = [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.error("保存に失敗しました", err);
      showToast("保存に失敗しました（ブラウザの容量制限の可能性があります）");
    }
  }

  function makeId() {
    return "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---------------- Elements ----------------

  const els = {
    main: document.getElementById("main"),
    alphaRail: document.getElementById("alphaRail"),
    searchInput: document.getElementById("searchInput"),
    addBtn: document.getElementById("addBtn"),
    toast: document.getElementById("toast"),
    entryTotal: document.getElementById("entryTotal"),
    volumeCount: document.getElementById("volumeCount"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    overlay: document.getElementById("confirmOverlay"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmCancel: document.getElementById("confirmCancel"),
    confirmOk: document.getElementById("confirmOk"),
  };

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function firstChar(title) {
    return (title || "?").trim().charAt(0).toUpperCase() || "?";
  }

  function sortedEntries() {
    return [...entries].sort((a, b) => collator.compare(a.title, b.title));
  }

  function filteredEntries() {
    const term = searchTerm.trim().toLowerCase();
    let list = sortedEntries();
    if (term) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          (e.body || "").toLowerCase().includes(term) ||
          (e.category || "").toLowerCase().includes(term)
      );
    }
    if (activeLetter) {
      list = list.filter((e) => firstChar(e.title) === activeLetter);
    }
    return list;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, 2400);
  }

  // ---------------- Alpha rail ----------------

  function renderAlphaRail() {
    const letters = [...new Set(entries.map((e) => firstChar(e.title)))].sort((a, b) =>
      collator.compare(a, b)
    );

    els.alphaRail.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = "alpha-tab" + (activeLetter === null ? " is-active" : "");
    allBtn.textContent = "全";
    allBtn.type = "button";
    allBtn.addEventListener("click", () => {
      activeLetter = null;
      view = { name: "home" };
      render();
    });
    els.alphaRail.appendChild(allBtn);

    letters.forEach((letter) => {
      const btn = document.createElement("button");
      btn.className = "alpha-tab" + (activeLetter === letter ? " is-active" : "");
      btn.textContent = letter;
      btn.type = "button";
      btn.addEventListener("click", () => {
        activeLetter = activeLetter === letter ? null : letter;
        view = { name: "home" };
        render();
      });
      els.alphaRail.appendChild(btn);
    });
  }

  // ---------------- Views ----------------

  function renderHome() {
    const list = filteredEntries();

    if (entries.length === 0) {
      els.main.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <h3>まだ項目がありません</h3>
        <p>「+ 追加」から、最初の項目を書いてみましょう。</p>
      `;
      const btn = document.createElement("button");
      btn.className = "btn-add";
      btn.type = "button";
      btn.innerHTML = '<span class="plus">+</span> 追加';
      btn.addEventListener("click", () => openForm("add"));
      empty.appendChild(btn);
      els.main.appendChild(empty);
      return;
    }

    if (list.length === 0) {
      els.main.innerHTML = `
        <div class="empty-state">
          <h3>見つかりませんでした</h3>
          <p>検索条件や索引タブを変えてお試しください。</p>
        </div>
      `;
      return;
    }

    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = searchTerm
      ? `「${searchTerm}」の検索結果（${list.length}件）`
      : activeLetter
      ? `索引：${activeLetter}（${list.length}件）`
      : `すべての項目（${list.length}件）`;

    const grid = document.createElement("div");
    grid.className = "entry-grid";

    list.forEach((entry) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "entry-card";
      card.innerHTML = `
        ${entry.category ? `<span class="category-tag">${escapeHtml(entry.category)}</span>` : ""}
        <h3>${escapeHtml(entry.title)}</h3>
        <p>${escapeHtml(entry.body)}</p>
      `;
      card.addEventListener("click", () => {
        view = { name: "article", id: entry.id };
        render();
      });
      grid.appendChild(card);
    });

    els.main.innerHTML = "";
    els.main.appendChild(label);
    els.main.appendChild(grid);
  }

  function renderArticle(id) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      view = { name: "home" };
      render();
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "article-view";

    const back = document.createElement("button");
    back.className = "back-link";
    back.type = "button";
    back.textContent = "← 一覧にもどる";
    back.addEventListener("click", () => {
      view = { name: "home" };
      render();
    });

    const head = document.createElement("div");
    head.className = "article-head";
    head.innerHTML = `
      <div>
        <h2>${escapeHtml(entry.title)}</h2>
        <div class="article-meta">
          ${entry.category ? `<span class="category-tag">${escapeHtml(entry.category)}</span>` : ""}
          <span>更新日: ${formatDate(entry.updatedAt)}</span>
        </div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "article-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-ghost";
    editBtn.type = "button";
    editBtn.textContent = "編集する";
    editBtn.addEventListener("click", () => openForm("edit", entry.id));

    const delBtn = document.createElement("button");
    delBtn.className = "btn-danger";
    delBtn.type = "button";
    delBtn.textContent = "削除する";
    delBtn.addEventListener("click", () => askDelete(entry.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    head.appendChild(actions);

    const body = document.createElement("div");
    body.className = "article-body";
    body.textContent = entry.body;

    wrap.appendChild(back);
    wrap.appendChild(head);
    wrap.appendChild(body);

    els.main.innerHTML = "";
    els.main.appendChild(wrap);
  }

  function formatDate(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderForm(mode, id) {
    const editing = mode === "edit";
    const entry = editing ? entries.find((e) => e.id === id) : null;
    if (editing && !entry) {
      view = { name: "home" };
      render();
      return;
    }

    const form = document.createElement("form");
    form.className = "entry-form";
    form.noValidate = true;
    form.innerHTML = `
      <h2>${editing ? "項目を編集" : "新しい項目を追加"}</h2>

      <div class="form-field" id="titleField">
        <label for="titleInput">項目名</label>
        <input type="text" id="titleInput" maxlength="60" value="${
          editing ? escapeHtml(entry.title) : ""
        }" placeholder="例：光合成">
        <span class="field-error">項目名を入力してください。</span>
      </div>

      <div class="form-field">
        <label for="categoryInput">分類（任意）</label>
        <input type="text" id="categoryInput" maxlength="20" value="${
          editing ? escapeHtml(entry.category || "") : ""
        }" placeholder="例：自然科学">
      </div>

      <div class="form-field" id="bodyField">
        <label for="bodyInput">本文</label>
        <textarea id="bodyInput" placeholder="この項目について説明を書きます。">${
          editing ? escapeHtml(entry.body) : ""
        }</textarea>
        <span class="field-error">本文を入力してください。</span>
        <span class="form-hint">改行はそのまま表示に反映されます。</span>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${editing ? "変更を保存" : "この項目を保存"}</button>
        <button type="button" class="btn-ghost" id="cancelFormBtn">やめる</button>
      </div>
    `;

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const titleInput = form.querySelector("#titleInput");
      const bodyInput = form.querySelector("#bodyInput");
      const categoryInput = form.querySelector("#categoryInput");

      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();

      let valid = true;
      form.querySelector("#titleField").classList.toggle("has-error", !title);
      form.querySelector("#bodyField").classList.toggle("has-error", !body);
      if (!title || !body) valid = false;
      if (!valid) return;

      if (editing) {
        entry.title = title;
        entry.category = categoryInput.value.trim();
        entry.body = body;
        entry.updatedAt = Date.now();
        showToast("項目を更新しました");
        view = { name: "article", id: entry.id };
      } else {
        const newEntry = {
          id: makeId(),
          title,
          category: categoryInput.value.trim(),
          body,
          updatedAt: Date.now(),
        };
        entries.push(newEntry);
        showToast("新しい項目を追加しました");
        view = { name: "article", id: newEntry.id };
      }
      saveEntries();
      render();
    });

    form.querySelector("#cancelFormBtn").addEventListener("click", () => {
      view = editing ? { name: "article", id: entry.id } : { name: "home" };
      render();
    });

    els.main.innerHTML = "";
    els.main.appendChild(form);
    form.querySelector("#titleInput").focus();
  }

  function openForm(mode, id) {
    view = { name: "form", mode, id };
    render();
  }

  // ---------------- Delete confirmation ----------------

  function askDelete(id) {
    pendingDeleteId = id;
    els.overlay.hidden = false;
    const entry = entries.find((e) => e.id === id);
    els.confirmMessage.textContent = entry
      ? `「${entry.title}」を削除しますか？この操作は取り消せません。`
      : "この項目を削除しますか？";
    els.confirmOk.focus();
  }

  function closeConfirm() {
    pendingDeleteId = null;
    els.overlay.hidden = true;
  }

  els.confirmCancel.addEventListener("click", closeConfirm);
  els.confirmOk.addEventListener("click", () => {
    if (!pendingDeleteId) return;
    entries = entries.filter((e) => e.id !== pendingDeleteId);
    saveEntries();
    closeConfirm();
    view = { name: "home" };
    showToast("項目を削除しました");
    render();
  });
  els.overlay.addEventListener("click", (ev) => {
    if (ev.target === els.overlay) closeConfirm();
  });

  // ---------------- Export / Import ----------------

  els.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "encyclopedia-entries.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("JSONファイルを書き出しました");
  });

  els.importInput.addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("形式が正しくありません");
        const cleaned = parsed
          .filter((e) => e && typeof e.title === "string" && typeof e.body === "string")
          .map((e) => ({
            id: e.id && typeof e.id === "string" ? e.id : makeId(),
            title: e.title,
            category: typeof e.category === "string" ? e.category : "",
            body: e.body,
            updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : Date.now(),
          }));

        const existingIds = new Set(entries.map((e) => e.id));
        const merged = [...entries];
        let added = 0;
        cleaned.forEach((e) => {
          if (!existingIds.has(e.id)) {
            merged.push(e);
            added++;
          }
        });
        entries = merged;
        saveEntries();
        view = { name: "home" };
        render();
        showToast(`${added}件の項目を読み込みました`);
      } catch (err) {
        console.error(err);
        showToast("読み込みに失敗しました。ファイルの形式を確認してください。");
      }
      els.importInput.value = "";
    };
    reader.readAsText(file);
  });

  // ---------------- Search / Add wiring ----------------

  els.searchInput.addEventListener("input", (ev) => {
    searchTerm = ev.target.value;
    if (view.name !== "home") view = { name: "home" };
    render();
  });

  els.addBtn.addEventListener("click", () => openForm("add"));

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !els.overlay.hidden) closeConfirm();
  });

  // ---------------- Master render ----------------

  function render() {
    renderAlphaRail();
    els.entryTotal.textContent = `全 ${entries.length} 項目`;
    els.volumeCount.textContent = Math.max(1, Math.ceil(entries.length / 12));

    if (view.name === "article") {
      renderArticle(view.id);
    } else if (view.name === "form") {
      renderForm(view.mode, view.id);
    } else {
      renderHome();
    }
  }

  // ---------------- Init ----------------

  loadEntries();
  render();
})();
