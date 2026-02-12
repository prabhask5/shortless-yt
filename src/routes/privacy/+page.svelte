<!--
  Privacy Policy Page (/privacy/+page.svelte)

  Static legal page displaying the Shortless privacy policy. Covers:
  - Overview of what Shortless is and how it handles data
  - Information collected: Google account data (profile, YouTube subscriptions) and
    automatically collected data (search history in localStorage, theme preference)
  - How data is used: subscriptions for recommendations, profile for display only
  - Data storage: HTTP-only HMAC-signed session cookies, no server-side database,
    browser localStorage for preferences
  - Third-party services: Google OAuth 2.0, YouTube Data API v3
  - Data sharing policy (none)
  - Data retention and deletion: 7-day cookie expiry, sign-out clears session,
    instructions for revoking Google access
  - Google API Services User Data Policy compliance (Limited Use requirements)
  - Children's privacy (not intended for under 13)
  - Contact information (GitHub issues)

  This page has no script block — it is purely static HTML with scoped styles.
  No data fetching or reactive state is needed.
-->
<svelte:head>
	<title>Privacy Policy - Shortless Youtube</title>
</svelte:head>

<div class="legal-page">
	<h1>Privacy Policy</h1>
	<p class="last-updated">Last updated: February 5, 2026</p>

	<section>
		<h2>Overview</h2>
		<p>
			Shortless ("we", "our", "the app") is a web application that provides a YouTube browsing
			experience with Shorts filtered out. This policy explains how we handle your data.
		</p>
	</section>

	<section>
		<h2>Information We Collect</h2>

		<h3>Google Account Data</h3>
		<p>
			When you sign in with Google, we access the following information through the YouTube Data API
			v3:
		</p>
		<ul>
			<li>Your Google profile name and profile picture</li>
			<li>Your YouTube subscriptions (to provide personalized recommendations)</li>
		</ul>

		<h3>Automatically Collected Data</h3>
		<ul>
			<li>
				<strong>Search history:</strong> Your searches are stored locally in your browser's localStorage.
				This data never leaves your device.
			</li>
			<li>
				<strong>Theme preference:</strong> Your light/dark mode preference is stored locally in your browser.
			</li>
		</ul>
	</section>

	<section>
		<h2>How We Use Your Data</h2>
		<ul>
			<li>
				<strong>YouTube subscriptions</strong> are used solely to generate personalized video recommendations
				on the homepage. We fetch subscription data on each request and do not store it permanently.
			</li>
			<li>
				<strong>Profile information</strong> (name, picture) is used only to display your signed-in status
				in the app.
			</li>
			<li>We do not use your data for advertising, tracking, or analytics.</li>
		</ul>
	</section>

	<section>
		<h2>Data Storage</h2>
		<ul>
			<li>
				<strong>Authentication tokens</strong> are stored in HTTP-only cookies signed with HMAC. These
				are used to maintain your session and make YouTube API requests on your behalf.
			</li>
			<li>
				<strong>No database:</strong> We do not operate a database. No user data is stored on our servers
				beyond the session cookie.
			</li>
			<li>
				<strong>Local storage:</strong> Search history and theme preferences are stored in your browser
				only.
			</li>
		</ul>
	</section>

	<section>
		<h2>Third-Party Services</h2>
		<p>We use the following third-party services:</p>
		<ul>
			<li>
				<strong>Google OAuth 2.0:</strong> For authentication. Subject to
				<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
					>Google's Privacy Policy</a
				>.
			</li>
			<li>
				<strong>YouTube Data API v3:</strong> To fetch videos, search results, and subscription
				data. Subject to
				<a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer"
					>YouTube's Terms of Service</a
				>.
			</li>
		</ul>
	</section>

	<section>
		<h2>Data Sharing</h2>
		<p>We do not sell, share, or transfer your personal data to any third parties.</p>
	</section>

	<section>
		<h2>Data Retention & Deletion</h2>
		<ul>
			<li>Session cookies expire after 7 days or when you sign out.</li>
			<li>Signing out immediately deletes your session cookie.</li>
			<li>
				You can clear your local search history from the homepage or by clearing your browser data.
			</li>
			<li>
				You can revoke Shortless's access to your Google account at any time from your <a
					href="https://myaccount.google.com/permissions"
					target="_blank"
					rel="noopener noreferrer">Google Account permissions</a
				>.
			</li>
		</ul>
	</section>

	<section>
		<h2>Google API Services User Data Policy</h2>
		<p>
			Shortless's use and transfer of information received from Google APIs adheres to the <a
				href="https://developers.google.com/terms/api-services-user-data-policy"
				target="_blank"
				rel="noopener noreferrer">Google API Services User Data Policy</a
			>, including the Limited Use requirements.
		</p>
	</section>

	<section>
		<h2>Children's Privacy</h2>
		<p>
			This app is not intended for children under 13. We do not knowingly collect information from
			children under 13.
		</p>
	</section>

	<section>
		<h2>Changes to This Policy</h2>
		<p>
			We may update this policy from time to time. Changes will be posted on this page with an
			updated date.
		</p>
	</section>

	<section>
		<h2>Contact</h2>
		<p>
			If you have questions about this privacy policy, please open an issue on our <a
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

	h3 {
		font-size: 15px;
		font-weight: 500;
		margin-top: 12px;
		margin-bottom: 4px;
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
