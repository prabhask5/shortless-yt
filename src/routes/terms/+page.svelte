<!--
  Terms of Service Page (/terms/+page.svelte)

  Static legal page displaying the Shortless terms of service. Covers:
  - Acceptance of terms
  - Description of service (YouTube alternative with Shorts filtered out, using YouTube Data API v3)
  - User accounts: optional sign-in, responsibilities, revocation
  - Acceptable use policy (no abuse, scraping, or service disruption)
  - YouTube content: all content sourced from YouTube, users bound by YouTube ToS and Google Privacy Policy
  - Intellectual property: open-source, not affiliated with Google/YouTube
  - Disclaimer of warranties ("as is" / "as available")
  - Limitation of liability
  - Termination rights
  - Changes to terms policy
  - Contact information (GitHub issues)

  This page has no script block — it is purely static HTML with scoped styles.
  No data fetching or reactive state is needed.
-->
<svelte:head>
	<title>Terms of Service - Shortless Youtube</title>
</svelte:head>

<div class="legal-page">
	<h1>Terms of Service</h1>
	<p class="last-updated">Last updated: February 5, 2026</p>

	<section>
		<h2>Acceptance of Terms</h2>
		<p>
			By using Shortless ("the app", "the service"), you agree to these Terms of Service. If you do
			not agree, please do not use the app.
		</p>
	</section>

	<section>
		<h2>Description of Service</h2>
		<p>
			Shortless is a free, open-source web application that provides an alternative interface for
			browsing YouTube content with short-form videos (YouTube Shorts) filtered out. The app uses
			the YouTube Data API v3 to fetch and display video content.
		</p>
	</section>

	<section>
		<h2>User Accounts</h2>
		<ul>
			<li>You may use Shortless without signing in to browse trending videos and search.</li>
			<li>
				Signing in with your Google account enables personalized recommendations based on your
				YouTube subscriptions.
			</li>
			<li>You are responsible for maintaining the security of your Google account.</li>
			<li>You can sign out or revoke access at any time.</li>
		</ul>
	</section>

	<section>
		<h2>Acceptable Use</h2>
		<p>You agree not to:</p>
		<ul>
			<li>Use the app for any unlawful purpose</li>
			<li>Attempt to circumvent rate limits or abuse the service</li>
			<li>Scrape, crawl, or automatically access the app in an excessive manner</li>
			<li>Interfere with or disrupt the service</li>
		</ul>
	</section>

	<section>
		<h2>YouTube Content</h2>
		<p>
			All video content displayed through Shortless is sourced from YouTube via the YouTube Data API
			v3. By using this app, you also agree to be bound by:
		</p>
		<ul>
			<li>
				<a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer"
					>YouTube Terms of Service</a
				>
			</li>
			<li>
				<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
					>Google Privacy Policy</a
				>
			</li>
		</ul>
		<p>
			Shortless does not host, store, or redistribute any video content. Videos are played directly
			from YouTube.
		</p>
	</section>

	<section>
		<h2>Intellectual Property</h2>
		<p>
			Shortless is open-source software. The app code is available on <a
				href="https://github.com/prabhask5/shortless-yt"
				target="_blank"
				rel="noopener noreferrer">GitHub</a
			>. YouTube, the YouTube logo, and related marks are trademarks of Google LLC. Shortless is not
			affiliated with, endorsed by, or sponsored by Google or YouTube.
		</p>
	</section>

	<section>
		<h2>Disclaimer of Warranties</h2>
		<p>
			The service is provided "as is" and "as available" without warranties of any kind, either
			express or implied. We do not guarantee that the service will be uninterrupted, error-free, or
			available at all times. Video availability and API access depend on YouTube's services.
		</p>
	</section>

	<section>
		<h2>Limitation of Liability</h2>
		<p>
			To the fullest extent permitted by law, Shortless and its maintainers shall not be liable for
			any indirect, incidental, special, or consequential damages arising from your use of the
			service.
		</p>
	</section>

	<section>
		<h2>Termination</h2>
		<p>
			We reserve the right to suspend or terminate access to the service at any time, for any
			reason, without notice. You may stop using the service at any time by closing the app and
			revoking Google account access if applicable.
		</p>
	</section>

	<section>
		<h2>Changes to These Terms</h2>
		<p>
			We may update these terms from time to time. Changes will be posted on this page with an
			updated date. Continued use of the service after changes constitutes acceptance of the updated
			terms.
		</p>
	</section>

	<section>
		<h2>Contact</h2>
		<p>
			If you have questions about these terms, please open an issue on our <a
				href="https://github.com/prabhask5/shortless-yt"
				target="_blank"
				rel="noopener noreferrer">GitHub repository</a
			>.
		</p>
	</section>
</div>

<style>
	.legal-page {
		max-width: 720px;
		margin: 0 auto;
		padding: 24px 0;
	}

	h1 {
		font-size: 28px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.last-updated {
		font-size: 13px;
		color: var(--text-secondary);
		margin-bottom: 32px;
	}

	section {
		margin-bottom: 28px;
	}

	h2 {
		font-size: 18px;
		font-weight: 600;
		margin-bottom: 8px;
	}

	p {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.7;
	}

	ul {
		padding-left: 20px;
		list-style: disc;
	}

	li {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.7;
		margin-bottom: 4px;
	}

	a {
		color: var(--text-link);
	}

	a:hover {
		text-decoration: underline;
	}
</style>
