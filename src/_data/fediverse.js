import EleventyFetch from '@11ty/eleventy-fetch';

async function lookupAccount(baseUrl, acct) {
  let url = `${baseUrl}/api/v1/accounts/lookup?acct=${acct}`;
  let data = await EleventyFetch(url, {
    duration: '1d',
    type: 'json'
  });
  return data.id;
}

async function fetchStatuses(baseUrl, userId) {
  let url = `${baseUrl}/api/v1/accounts/${userId}/statuses?exclude_replies=true&exclude_reblogs=true`;
  let data = await EleventyFetch(url, {
    duration: '1h',
    type: 'json'
  });
  return data;
}

async function fetchThread(baseUrl, statusId) {
  let url = `${baseUrl}/api/v1/statuses/${statusId}/context`;
  let data = await EleventyFetch(url, {
    duration: '1h',
    type: 'json'
  });
  return data;
}

function processMediaAttachments(mediaAttachments) {
  if (!mediaAttachments || mediaAttachments.length === 0) return null;
  
  return mediaAttachments.map(media => ({
    url: media.url,
    preview_url: media.preview_url,
    description: media.description || '',
    type: media.type
  }));
}

function groupThreadedPosts(posts) {
  const threadMap = new Map();
  const standalonePosts = [];

  // First pass: identify threads and standalone posts
  posts.forEach(post => {
    if (post.in_reply_to_id) {
      const threadId = post.in_reply_to_id;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId).push(post);
    } else {
      standalonePosts.push(post);
    }
  });

  // Second pass: combine threads with their parent posts
  const result = [];
  
  // Add standalone posts
  standalonePosts.forEach(post => {
    result.push({
      ...post,
      media_attachments: processMediaAttachments(post.media_attachments),
      is_thread: false
    });
  });

  // Add threaded posts
  for (const [threadId, threadPosts] of threadMap) {
    const parentPost = posts.find(p => p.id === threadId);
    if (parentPost) {
      result.push({
        ...parentPost,
        media_attachments: processMediaAttachments(parentPost.media_attachments),
        is_thread: true,
        thread_posts: threadPosts.map(post => ({
          ...post,
          media_attachments: processMediaAttachments(post.media_attachments)
        }))
      });
    }
  }

  return result;
}

export default async function () {
  const mastodonBaseUrl = 'https://mastodon.nz';
  const mastodonAcct = 'darren';

  let fediverse = { mastodon: [] };

  try {
    // Fetch Mastodon posts
    let mastodonUserId = await lookupAccount(mastodonBaseUrl, mastodonAcct);
    let posts = await fetchStatuses(mastodonBaseUrl, mastodonUserId);
    
    // Process and group posts
    fediverse.mastodon = groupThreadedPosts(posts);
  } catch (err) {
    console.error('Error fetching Mastodon posts:', err);
  }

  return fediverse;
}