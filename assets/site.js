// Opened straight from a folder (file://), links to "privacy/" would show a folder
// listing instead of the page. Point them at index.html in that case.
if (location.protocol === "file:") {
  document.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute("href");
    if (/^(\.\.?\/|[\w-]+\/)/.test(href) && /\/$/.test(href)) a.setAttribute("href", href + "index.html");
    else if (href === "./" || href === "../") a.setAttribute("href", href + "index.html");
  });
}
