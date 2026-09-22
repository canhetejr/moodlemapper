// Parser do HTML de uma página de curso do Moodle (course/view.php?id=X).
// Funciona tanto no browser (extensão) quanto em Node com jsdom (para testes),
// desde que receba um `Document`.
// Exporta via `window.MoodleMapperParser` no browser e via module.exports no Node.

(function (root) {
  "use strict";

  function text(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function getCourseName(doc) {
    var candidates = [
      ".page-header-headings h1",
      "h1.h2",
      "#page-header h1",
      "header h1",
      "title"
    ];
    for (var i = 0; i < candidates.length; i++) {
      var el = doc.querySelector(candidates[i]);
      if (el && text(el)) {
        var t = text(el);
        // <title> do Moodle normalmente é "Nome do curso: Nome do curso" ou "Nome do curso"
        if (candidates[i] === "title") {
          t = t.split(":")[0].trim();
        }
        return t;
      }
    }
    return "";
  }

  function getSectionName(sectionEl, index) {
    var candidates = [
      ".sectionname",
      "h3.sectionname",
      "[data-for='section_title']",
      ".content > h3"
    ];
    for (var i = 0; i < candidates.length; i++) {
      var el = sectionEl.querySelector(candidates[i]);
      if (el && text(el)) return text(el);
    }
    // fallback: usa o id da seção (section-0, section-1...)
    var id = sectionEl.getAttribute("id") || "";
    var m = id.match(/section-(\d+)/);
    if (m) return "Tópico " + m[1];
    return "Tópico " + (index + 1);
  }

  function getActivityType(activityEl) {
    var cls = activityEl.className || "";
    var m = cls.match(/modtype_([\w-]+)/);
    if (m) return m[1];
    // Moodle 4.x às vezes guarda o tipo em data-region ou no ícone do módulo
    var iconImg = activityEl.querySelector("img.activityicon, img.iconlarge");
    if (iconImg && iconImg.src) {
      var im = iconImg.src.match(/\/(\w+)\/(?:mod_)?icon/);
      if (im) return im[1];
    }
    return "desconhecido";
  }

  function getActivities(sectionEl) {
    var nodes = sectionEl.querySelectorAll(
      "li.activity, div.activity, li.activity-item, div.activity-item"
    );
    var out = [];
    var seen = new Set();
    nodes.forEach(function (node) {
      var link =
        node.querySelector("a.aalink") ||
        node.querySelector(".activity-instance a") ||
        node.querySelector(".activityinstance a") ||
        node.querySelector("a[href*='/mod/']");
      var nameEl =
        node.querySelector(".instancename") ||
        node.querySelector(".activityname") ||
        link;
      var name = text(nameEl);
      // remove o texto de acessibilidade escondido (ex: "Arquivo", "Página")
      var hidden = nameEl ? nameEl.querySelector(".accesshide") : null;
      if (hidden) {
        name = name.replace(text(hidden), "").trim();
      }
      if (!name) return;
      var url = link ? link.href || link.getAttribute("href") || "" : "";
      var key = name + "|" + url;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        name: name,
        type: getActivityType(node),
        url: url
      });
    });
    return out;
  }

  function getCategoryFromBreadcrumb(doc) {
    var items = doc.querySelectorAll(
      ".breadcrumb li, nav[aria-label] ol li, .breadcrumb-item"
    );
    if (!items.length) return "";
    var texts = [];
    items.forEach(function (li) {
      var t = text(li);
      if (t) texts.push(t);
    });
    // remove o primeiro (home/página inicial) e o último (o próprio curso)
    if (texts.length > 2) {
      texts = texts.slice(1, -1);
    } else {
      texts = [];
    }
    return texts.join(" / ");
  }

  // Lê course/edit.php?id=X (página de configurações do curso).
  // Requer permissão de edição; se não tiver acesso, retorna campos vazios.
  function parseCourseSettings(doc) {
    var shortname = "";
    var category = "";

    var shortnameInput = doc.querySelector("#id_shortname");
    if (shortnameInput) shortname = shortnameInput.value || "";

    var categorySelect = doc.querySelector("#id_category");
    if (categorySelect) {
      var selectedOption =
        categorySelect.querySelector("option[selected]") ||
        categorySelect.options[categorySelect.selectedIndex];
      if (selectedOption) category = text(selectedOption);
    }

    return { shortname: shortname, category: category };
  }

  function parseCourse(doc, courseId) {
    var courseName = getCourseName(doc);
    var sectionNodes = doc.querySelectorAll(
      "li.section.main, li.section, div.section.main, div.course-section"
    );
    var topics = [];
    var seenSections = new Set();
    sectionNodes.forEach(function (sectionEl, i) {
      var id = sectionEl.getAttribute("id") || "idx-" + i;
      if (seenSections.has(id)) return;
      seenSections.add(id);
      var name = getSectionName(sectionEl, i);
      var resources = getActivities(sectionEl);
      topics.push({ name: name, resources: resources });
    });

    return {
      courseId: courseId,
      courseName: courseName,
      category: getCategoryFromBreadcrumb(doc),
      topics: topics
    };
  }

  var api = {
    parseCourse: parseCourse,
    parseCourseSettings: parseCourseSettings
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MoodleMapperParser = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
