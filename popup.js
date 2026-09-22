(function () {
  "use strict";

  var idsEl = document.getElementById("ids");
  var baseUrlEl = document.getElementById("baseUrl");
  var runBtn = document.getElementById("run");
  var clearBtn = document.getElementById("clear");
  var logEl = document.getElementById("log");
  var summaryEl = document.getElementById("summary");

  function log(msg) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  clearBtn.addEventListener("click", function () {
    logEl.textContent = "";
    summaryEl.textContent = "";
  });

  function parseIdsInput(raw) {
    var pieces = raw.split(/[\s,;]+/).filter(Boolean);
    var ids = [];
    pieces.forEach(function (p) {
      var m = p.match(/id=(\d+)/);
      if (m) {
        ids.push(m[1]);
      } else if (/^\d+$/.test(p)) {
        ids.push(p);
      }
    });
    // remove duplicados mantendo a ordem
    return ids.filter(function (id, i) {
      return ids.indexOf(id) === i;
    });
  }

  async function detectBaseUrl() {
    var manual = baseUrlEl.value.trim();
    if (manual) return manual.replace(/\/+$/, "");
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      var u = new URL(tabs[0].url);
      return u.origin;
    }
    throw new Error("Não foi possível detectar a URL base. Informe manualmente.");
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isLoginPage(doc) {
    return !!doc.querySelector("#login, form#login");
  }

  async function fetchDoc(url) {
    var res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " ao acessar " + url);
    }
    var html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  async function fetchCourseDoc(baseUrl, courseId) {
    var url = baseUrl + "/course/view.php?id=" + encodeURIComponent(courseId);
    var doc = await fetchDoc(url);
    if (isLoginPage(doc)) {
      throw new Error(
        "Não está logado no Moodle nessa aba/base. Faça login e tente novamente."
      );
    }
    return doc;
  }

  async function fetchCourseSettings(baseUrl, courseId) {
    var url = baseUrl + "/course/edit.php?id=" + encodeURIComponent(courseId);
    try {
      var doc = await fetchDoc(url);
      if (isLoginPage(doc)) return null;
      // sem permissão de edição, o Moodle costuma mostrar uma página de erro
      // sem o formulário — nesse caso simplesmente não achamos os campos.
      return window.MoodleMapperParser.parseCourseSettings(doc);
    } catch (err) {
      return null;
    }
  }

  function buildRows(course, settings) {
    var rows = [];
    var shortname = settings && settings.shortname ? settings.shortname : "";
    var category =
      (settings && settings.category) || course.category || "";

    course.topics.forEach(function (topic) {
      if (!topic.resources.length) {
        rows.push({
          course_id: course.courseId,
          shortname: shortname,
          course_name: course.courseName,
          category: category,
          topic: topic.name,
          resource_name: "",
          resource_type: "",
          resource_url: ""
        });
      } else {
        topic.resources.forEach(function (r) {
          rows.push({
            course_id: course.courseId,
            shortname: shortname,
            course_name: course.courseName,
            category: category,
            topic: topic.name,
            resource_name: r.name,
            resource_type: r.type,
            resource_url: r.url
          });
        });
      }
    });
    return rows;
  }

  var COLUMNS = [
    { key: "course_id", header: "ID do Curso", width: 10 },
    { key: "shortname", header: "Nome Curto", width: 18 },
    { key: "course_name", header: "Nome do Curso", width: 42 },
    { key: "category", header: "Categoria", width: 30 },
    { key: "topic", header: "Tópico", width: 34 },
    { key: "resource_name", header: "Recurso", width: 46 },
    { key: "resource_type", header: "Tipo", width: 14 },
    { key: "resource_url", header: "Link", width: 55 }
  ];

  function buildWorkbook(rows) {
    var header = COLUMNS.map(function (c) {
      return c.header;
    });
    var data = [header].concat(
      rows.map(function (r) {
        return COLUMNS.map(function (c) {
          return r[c.key] == null ? "" : r[c.key];
        });
      })
    );

    var ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = COLUMNS.map(function (c) {
      return { wch: c.width };
    });
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: data.length - 1, c: header.length - 1 }
      })
    };

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapa de Cursos");
    return wb;
  }

  function downloadWorkbook(wb, filename) {
    var wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    var blob = new Blob([wbout], {
      type: "application/octet-stream"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 5000);
  }

  async function run() {
    summaryEl.textContent = "";
    logEl.textContent = "";
    var ids = parseIdsInput(idsEl.value);
    if (!ids.length) {
      log("Nenhum ID válido encontrado. Cole IDs numéricos ou URLs com ?id=.");
      return;
    }

    var baseUrl;
    try {
      baseUrl = await detectBaseUrl();
    } catch (err) {
      log("Erro: " + err.message);
      return;
    }

    log("Base do Moodle: " + baseUrl);
    log("Cursos a processar: " + ids.length);

    runBtn.disabled = true;
    var allRows = [];
    var ok = 0;
    var failed = [];
    var noSettingsAccess = 0;

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      log("[" + (i + 1) + "/" + ids.length + "] Curso " + id + "...");
      try {
        var doc = await fetchCourseDoc(baseUrl, id);
        var course = window.MoodleMapperParser.parseCourse(doc, id);
        var settings = await fetchCourseSettings(baseUrl, id);
        if (!settings || !settings.shortname) noSettingsAccess++;

        var rows = buildRows(course, settings);
        allRows = allRows.concat(rows);

        var resourceCount = course.topics.reduce(function (acc, t) {
          return acc + t.resources.length;
        }, 0);
        log(
          "  → " +
            course.courseName +
            (settings && settings.shortname ? " (" + settings.shortname + ")" : "") +
            " | " +
            course.topics.length +
            " tópicos, " +
            resourceCount +
            " recursos"
        );
        ok++;
      } catch (err) {
        log("  ERRO: " + err.message);
        failed.push(id);
      }
      await sleep(350); // evita bombardear o servidor
    }

    runBtn.disabled = false;

    if (!allRows.length) {
      summaryEl.textContent = "Nenhum dado extraído.";
      return;
    }

    var wb = buildWorkbook(allRows);
    var filename =
      "moodle-mapa-" + new Date().toISOString().slice(0, 10) + ".xlsx";
    downloadWorkbook(wb, filename);

    summaryEl.textContent =
      ok +
      "/" +
      ids.length +
      " cursos mapeados, " +
      allRows.length +
      " linhas exportadas para " +
      filename +
      (failed.length ? ". Falharam: " + failed.join(", ") : "") +
      (noSettingsAccess
        ? ". Sem acesso às configurações (nome curto/categoria) em " +
          noSettingsAccess +
          " curso(s)."
        : "");
  }

  runBtn.addEventListener("click", function () {
    run().catch(function (err) {
      log("Erro inesperado: " + err.message);
      runBtn.disabled = false;
    });
  });
})();
