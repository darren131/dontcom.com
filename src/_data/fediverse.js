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
  let url = `${baseUrl}/api/v1/accounts/${userId}/statuses?exclude_replies=false&exclude_reblogs=true&include_media=true&include_media_description=true&include_media_metadata=true&limit=40`;
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
    type: media.type,
    meta: media.meta || {}
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
    console.log(`[Fediverse] Found user ID: ${mastodonUserId}`);
    
    let posts = await fetchStatuses(mastodonBaseUrl, mastodonUserId);
    console.log(`[Fediverse] Fetched ${posts.length} posts`);
    
    // Log a sample post to see its structure
    if (posts.length > 0) {
      console.log('[Fediverse] Sample post structure:', {
        id: posts[0].id,
        has_media: !!posts[0].media_attachments,
        media_count: posts[0].media_attachments?.length || 0,
        is_reply: !!posts[0].in_reply_to_id,
        media_attachments: posts[0].media_attachments || []
      });
    }
    
    // Process and group posts
    fediverse.mastodon = groupThreadedPosts(posts);
    
    // Log summary of processed data
    console.log('[Fediverse] Processed data summary:', {
      total_posts: fediverse.mastodon.length,
      posts_with_media: fediverse.mastodon.filter(p => p.media_attachments?.length > 0).length,
      threaded_posts: fediverse.mastodon.filter(p => p.is_thread).length,
      posts_with_media_details: fediverse.mastodon
        .filter(p => p.media_attachments?.length > 0)
        .map(p => ({
          id: p.id,
          media_count: p.media_attachments.length,
          media_types: p.media_attachments.map(m => m.type)
        }))
    });
  } catch (err) {
    console.error('[Fediverse] Error fetching Mastodon posts:', err.message);
    if (err.response) {
      console.error('[Fediverse] Response status:', err.response.status);
      console.error('[Fediverse] Response data:', err.response.data);
    }
  }

  return fediverse;
}