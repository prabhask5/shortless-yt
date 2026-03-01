<svelte:head>
	<title>Privacy Policy - Shortless YouTube</title>
</svelte:head>

<div class="mx-auto max-w-screen-md px-4 py-8">
	<h1 class="mb-4 text-2xl font-bold">Privacy Policy</h1>
	<p class="text-yt-text-secondary mb-2 text-sm">Last updated: March 2026</p>

	<p class="text-yt-text-secondary mb-4">
		Shortless YouTube ("we", "our", "the app") is an alternative YouTube frontend. This privacy
		policy describes how we access, use, store, and protect your data, including data obtained
		through Google APIs. Our use and transfer of information received from Google APIs adheres to
		the
		<a
			href="https://developers.google.com/terms/api-services-user-data-policy"
			class="text-blue-400 hover:underline"
			target="_blank"
			rel="noopener noreferrer">Google API Services User Data Policy</a
		>, including the Limited Use requirements.
	</p>

	<h2 class="mt-6 mb-2 text-lg font-medium">Data Accessed</h2>
	<p class="text-yt-text-secondary mb-2">
		When you sign in with Google, we request the following OAuth scope:
	</p>
	<ul class="text-yt-text-secondary mb-4 list-disc pl-6">
		<li>
			<strong>youtube.readonly</strong> — Read-only access to your YouTube account data, including your
			subscriptions, liked videos, playlists, and channel information.
		</li>
	</ul>
	<p class="text-yt-text-secondary mb-4">
		We also receive your basic Google profile information (name and profile picture) to display in
		the app. We do not request write access and cannot modify your YouTube account in any way.
	</p>

	<h2 class="mt-6 mb-2 text-lg font-medium">Data Usage</h2>
	<p class="text-yt-text-secondary mb-2">
		Your Google user data is used exclusively to provide the core functionality of the app:
	</p>
	<ul class="text-yt-text-secondary mb-4 list-disc pl-6">
		<li>Displaying your YouTube subscriptions feed</li>
		<li>Showing your liked videos and playlists</li>
		<li>Displaying your profile name and picture in the app header</li>
	</ul>
	<p class="text-yt-text-secondary mb-4">
		We do not use your Google user data for advertising, analytics, market research, or to build
		user profiles. Your data is not used to train any AI or machine learning models.
	</p>

	<h2 class="mt-6 mb-2 text-lg font-medium">Data Sharing</h2>
	<p class="text-yt-text-secondary mb-4">
		We do not share, sell, rent, or disclose your Google user data to any third parties. Your data
		is only transmitted between your browser and YouTube's API servers through our server-side
		proxy. No third-party analytics, advertising, or tracking services have access to your data.
	</p>

	<h2 class="mt-6 mb-2 text-lg font-medium">Data Storage &amp; Protection</h2>
	<p class="text-yt-text-secondary mb-2">We take the following measures to protect your data:</p>
	<ul class="text-yt-text-secondary mb-4 list-disc pl-6">
		<li>
			Your OAuth access and refresh tokens are stored exclusively in an encrypted, HTTP-only, secure
			cookie in your browser. They are never stored in a database or on our servers.
		</li>
		<li>All connections use HTTPS encryption in transit.</li>
		<li>
			API responses may be temporarily cached on the server for performance (e.g. video metadata),
			but these caches contain only public YouTube data, not your personal account data.
		</li>
		<li>
			No personal data (name, email, profile picture, subscriptions, or liked videos) is persisted
			on our servers beyond the duration of the API request.
		</li>
	</ul>

	<h2 class="mt-6 mb-2 text-lg font-medium">Data Retention &amp; Deletion</h2>
	<p class="text-yt-text-secondary mb-2">
		Since we do not store your personal data on our servers, there is no long-term retention of your
		Google user data. Specifically:
	</p>
	<ul class="text-yt-text-secondary mb-4 list-disc pl-6">
		<li>
			Your OAuth tokens exist only in your browser cookie and are automatically deleted when you
			sign out or when the cookie expires.
		</li>
		<li>
			You can revoke access at any time by signing out of the app, which clears your session cookie.
			You can also revoke access from your
			<a
				href="https://myaccount.google.com/permissions"
				class="text-blue-400 hover:underline"
				target="_blank"
				rel="noopener noreferrer">Google Account permissions page</a
			>.
		</li>
		<li>Clearing your browser cookies will also remove all stored data.</li>
	</ul>

	<h2 class="mt-6 mb-2 text-lg font-medium">Cookies &amp; Local Storage</h2>
	<p class="text-yt-text-secondary mb-4">
		We use a single HTTP-only cookie to maintain your authenticated session. We use localStorage to
		save your theme preference (dark/light mode). No tracking cookies, advertising cookies, or
		third-party analytics cookies are used.
	</p>

	<h2 class="mt-6 mb-2 text-lg font-medium">Third-Party Services</h2>
	<p class="text-yt-text-secondary mb-4">
		Video playback uses YouTube's official embed player, which is subject to
		<a
			href="https://policies.google.com/privacy"
			class="text-blue-400 hover:underline"
			target="_blank"
			rel="noopener noreferrer">Google's Privacy Policy</a
		>. We do not integrate any other third-party analytics, tracking, or advertising services.
	</p>
</div>
