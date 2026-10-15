// Opened straight from a folder (file://), links to "privacy/" would show a folder
// listing instead of the page. Point them at index.html in that case.
if (location.protocol === "file:") {
  document.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute("href");
    if (/^(\.\.?\/|[\w-]+\/)/.test(href) && /\/$/.test(href)) a.setAttribute("href", href + "index.html");
    else if (href === "./" || href === "../") a.setAttribute("href", href + "index.html");
  });
}

// Launch list form: posts to a Supabase Edge Function that adds the email to Resend.
(function () {
  var form = document.getElementById("signup-form");
  if (!form) return;
  var ENDPOINT = "https://pdlvejbnmqpuxgonevaq.supabase.co/functions/v1/waitlist";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var FAILED = "That didn't go through. Try again in a minute, or email trackmypoops@gmail.com.";
  var status = form.querySelector(".signup-status");
  var button = form.querySelector('button[type="submit"]');
  var email = form.elements.email;

  function say(text, kind) {
    status.textContent = text;
    status.className = "signup-status" + (kind ? " " + kind : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var value = email.value.trim();
    if (!EMAIL_RE.test(value)) {
      say("That email doesn't look right.", "bad");
      email.focus();
      return;
    }
    var picked = form.querySelector('input[name="platform"]:checked');
    button.disabled = true;
    say("Sending...");
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value, platform: picked ? picked.value : "iphone", website: form.elements.website.value }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (j) {
        if (j && j.ok) {
          form.classList.add("done");
          say(j.already ? "You're already on the list. We haven't forgotten you." : "You're on the list. We'll email you when it's out.", "good");
        } else if (j && j.error === "email") {
          say("That email doesn't look right.", "bad");
          button.disabled = false;
        } else {
          say(FAILED, "bad");
          button.disabled = false;
        }
      })
      .catch(function () {
        say(FAILED, "bad");
        button.disabled = false;
      });
  });
})();
