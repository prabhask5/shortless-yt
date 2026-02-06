<svelte:head>
	<title>About - Shortless</title>
</svelte:head>

<div class="about-page">
	<h1>Shortless</h1>
	<p class="tagline">YouTube without Shorts</p>

	<section>
		<h2>What is Shortless?</h2>
		<p>
			Shortless is a free, open-source web application that provides an alternative way to browse
			YouTube. It automatically filters out short-form videos (YouTube Shorts) from search results,
			recommendations, and related videos so you can focus on the longer-form content you actually
			want to watch.
		</p>
		<p>
			The app is built as a Progressive Web App (PWA), meaning you can install it on your phone or
			computer and use it like a native application.
		</p>
	</section>

	<section>
		<h2>Features</h2>
		<ul>
			<li>
				<strong>Shorts-free browsing</strong> &mdash; All search results and video feeds are automatically
				filtered to remove videos shorter than 60 seconds (configurable in settings)
			</li>
			<li>
				<strong>Video search</strong> &mdash; Search YouTube's full catalog with Shorts filtered out of
				the results
			</li>
			<li>
				<strong>Trending videos</strong> &mdash; Browse popular videos on the homepage without needing
				an account
			</li>
			<li>
				<strong>Personalized recommendations</strong> &mdash; Sign in with Google to see videos from channels
				you're subscribed to on YouTube
			</li>
			<li>
				<strong>Video playback</strong> &mdash; Watch videos using YouTube's official embedded player
				with related video suggestions
			</li>
			<li>
				<strong>Dark and light mode</strong> &mdash; Switch between themes to match your preference
			</li>
			<li>
				<strong>Installable PWA</strong> &mdash; Add Shortless to your home screen on mobile or desktop
				for a native app experience
			</li>
		</ul>
	</section>

	<section>
		<h2>How It Works</h2>
		<p>
			Shortless uses the <strong>YouTube Data API v3</strong> to fetch video data including search results,
			trending videos, and channel uploads. When results are returned, the app checks each video's duration
			and filters out any that fall below the Shorts threshold (60 seconds by default). The remaining
			long-form videos are displayed in a clean, distraction-free interface.
		</p>
		<p>
			Videos are played using YouTube's official embedded player, so all playback features
			(including YouTube Premium ad-free viewing) work exactly as they do on YouTube.
		</p>
	</section>

	<section>
		<h2>Google Sign-In and User Data</h2>
		<p>Signing in with Google is entirely optional. Without an account, you can:</p>
		<ul>
			<li>Browse trending videos on the homepage</li>
			<li>Search for videos</li>
			<li>Watch any video</li>
		</ul>
		<p>
			If you choose to sign in, Shortless requests access to your
			<strong>YouTube subscriptions</strong> (read-only). This data is used for one purpose only: to show
			you personalized video recommendations from channels you subscribe to on YouTube.
		</p>
		<p>Specifically, when you sign in, the app:</p>
		<ol>
			<li>Reads your YouTube subscription list to find channels you follow</li>
			<li>Fetches recent uploads from a selection of those channels</li>
			<li>Filters out Shorts and displays the remaining videos on your homepage</li>
		</ol>
		<p>
			Your subscription data is fetched on each request and is <strong>not stored</strong> on our servers.
			We do not maintain a database. Authentication is handled through a signed session cookie that expires
			after 7 days or when you sign out.
		</p>
		<p>
			You can revoke Shortless's access to your Google account at any time from your
			<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"
				>Google Account permissions page</a
			>.
		</p>
	</section>

	<section>
		<h2>Open Source</h2>
		<p>
			Shortless is fully open-source. You can view the source code, report issues, or contribute on
			<a href="https://github.com/prabhask5/shortless-yt" target="_blank" rel="noopener noreferrer"
				>GitHub</a
			>.
		</p>
	</section>

	<div class="about-footer">
		<a href="/privacy">Privacy Policy</a>
		<span class="footer-dot">&middot;</span>
		<a href="/terms">Terms of Service</a>
	</div>
</div>

<style>
	.about-page {
		max-width: 720px;
		margin: 0 auto;
		padding: 24px 0;
	}

	h1 {
		font-size: 28px;
		font-weight: 600;
		margin-bottom: 2px;
	}

	.tagline {
		font-size: 16px;
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
		margin-bottom: 12px;
	}

	ul,
	ol {
		padding-left: 20px;
		margin-bottom: 12px;
	}

	ul {
		list-style: disc;
	}

	ol {
		list-style: decimal;
	}

	li {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.7;
		margin-bottom: 6px;
	}

	li strong {
		color: var(--text-primary);
	}

	a {
		color: var(--text-link);
	}

	a:hover {
		text-decoration: underline;
	}

	.about-footer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 24px;
		border-top: 1px solid var(--border-color);
		font-size: 12px;
		color: var(--text-tertiary);
	}

	.about-footer a {
		color: var(--text-tertiary);
		text-decoration: none;
	}

	.about-footer a:hover {
		color: var(--text-secondary);
		text-decoration: underline;
	}

	.footer-dot {
		font-size: 10px;
	}
</style>
