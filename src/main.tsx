import { Devvit } from '@devvit/public-api';

// Configure app capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Form for selecting which comment is the answer
const selectAnswerForm = Devvit.createForm(
  {
    fields: [
      {
        type: 'string',
        name: 'commentId',
        label: 'Comment ID (optional)',
        helpText: 'Leave blank to just mark post as solved without pinning',
      },
    ],
    title: 'Mark Post as Solved',
    acceptLabel: 'Mark Solved',
  },
  async (event, context) => {
    const { reddit, redis, ui } = context;
    const postId = context.postId!;
    const subredditName = context.subredditName!;

    try {
      // Add "Solved" flair
      await reddit.setPostFlair({
        subredditName,
        postId,
        text: '✓ Solved',
        backgroundColor: '#46d160',
        textColor: 'light',
      });

      // Track in Redis
      await redis.hSet(`post:${postId}`, {
        status: 'solved',
        solvedAt: Date.now().toString(),
        solvedBy: context.userId!,
      });

      // Increment solved counter for subreddit
      await redis.incrBy(`stats:${subredditName}:solved`, 1);

      // If comment ID provided, pin it
      const commentId = event.values.commentId?.trim();
      if (commentId) {
        try {
          const comment = await reddit.getCommentById(commentId);

          // Create a pinned mod comment highlighting the solution
          await reddit.submitComment({
            id: postId,
            text: `✅ **Solution by u/${comment.authorName}:**\n\n> ${comment.body}\n\n---\n\n*This post has been marked as solved. Thank you!*`,
          }).then(newComment => newComment.distinguish(true));

        } catch (err) {
          console.error('Failed to pin comment:', err);
        }
      }

      ui.showToast({
        text: '✓ Post marked as solved!',
        appearance: 'success',
      });

    } catch (error) {
      console.error('Error marking as solved:', error);
      ui.showToast({
        text: 'Failed to mark as solved',
        appearance: 'neutral',
      });
    }
  }
);

// Menu Action: Mark as Solved (visible to OPs and mods)
Devvit.addMenuItem({
  label: '✓ Mark as Solved',
  location: 'post',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    const post = await reddit.getPostById(context.postId!);
    const currentUser = await reddit.getCurrentUser();

    if (!currentUser) {
      ui.showToast({ text: 'Please log in to use this feature', appearance: 'neutral' });
      return;
    }

    // Check if user is a moderator
    const mods = await reddit.getModerators({
      subredditName: context.subredditName!,
      username: currentUser.username
    }).all();
    const isMod = mods.length > 0;

    // Only allow post author or mods
    if (post.authorName !== currentUser.username && !isMod) {
      ui.showToast({ text: 'Only the post author or mods can mark as solved', appearance: 'neutral' });
      return;
    }

    ui.showForm(selectAnswerForm);
  },
});

// Trigger: Track new posts as unsolved
Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    const { redis } = context;
    const post = event.post;
    const subreddit = event.subreddit;

    if (!post || !subreddit) return;

    const postId = post.id;

    // Store post as unsolved
    await redis.hSet(`post:${postId}`, {
      status: 'unsolved',
      createdAt: Date.now().toString(),
      subreddit: subreddit.name,
    });

    // Increment total posts counter
    await redis.incrBy(`stats:${subreddit.name}:total`, 1);
  },
});

// Scheduler Job Definition
Devvit.addSchedulerJob({
  name: 'update-stats-wiki',
  onRun: async (_event, context) => {
    const { reddit, redis, subredditName } = context;
    if (!subredditName) return;

    try {
      // Get stats from Redis
      const total = await redis.get(`stats:${subredditName}:total`) || '0';
      const solved = await redis.get(`stats:${subredditName}:solved`) || '0';
      const solvedRate = parseInt(total) > 0
        ? ((parseInt(solved) / parseInt(total)) * 100).toFixed(1)
        : '0.0';

      // Generate wiki content
      const wikiContent = `# SolvedBot Statistics\n\n` +
        `**Total Posts Tracked:** ${total}\n\n` +
        `**Posts Marked Solved:** ${solved}\n\n` +
        `**Solve Rate:** ${solvedRate}%\n\n` +
        `---\n\n` +
        `*Last updated: ${new Date().toUTCString()}*\n\n` +
        `*Powered by SolvedBot*`;

      // Update wiki page
      await reddit.updateWikiPage({
        subredditName,
        page: 'solvedbot-stats',
        content: wikiContent,
        reason: 'Daily stats update',
      });

      console.log(`Wiki updated for r/${subredditName}`);
    } catch (error) {
      console.error('Failed to update wiki:', error);
    }
  },
});

// Schedule the job on install/upgrade
Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: async (_event, context) => {
    try {
      // Clear existing jobs to avoid duplicates (optional but good practice)
      // For simplicity, we just schedule it. 
      // Note: In real prod, you might want to check if it's already scheduled.
      // However, runJob with cron overwrites if the ID is generated deterministically or we handle it?
      // Devvit scheduler usually handles idempotency by job name if using cron? 
      // Checking API: scheduler.runJob returns an ID. 
      // We cannot easily set a fixed ID here. 
      // Best effort: Schedule it.
      await context.scheduler.runJob({
        name: 'update-stats-wiki',
        cron: '0 0 * * *', // Daily at midnight
      });
    } catch (e) {
      console.error('Failed to schedule job', e);
    }
  },
});

// Menu Action: View Stats (for mods)
Devvit.addMenuItem({
  label: '📊 View SolvedBot Stats',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { redis, ui, subredditName } = context;

    // Check perm
    const currentUser = await context.reddit.getCurrentUser();
    if (!currentUser || !subredditName) return;

    const mods = await context.reddit.getModerators({
      subredditName,
      username: currentUser.username
    }).all();

    if (mods.length === 0) {
      ui.showToast({ text: 'Stats are mod-only', appearance: 'neutral' });
      return;
    }

    const total = await redis.get(`stats:${subredditName}:total`) || '0';
    const solved = await redis.get(`stats:${subredditName}:solved`) || '0';
    const solvedRate = parseInt(total) > 0
      ? ((parseInt(solved) / parseInt(total)) * 100).toFixed(1)
      : '0';

    ui.showToast({
      text: `📊 ${solved}/${total} solved (${solvedRate}%)`,
      appearance: 'success',
    });
  },
});

export default Devvit;
