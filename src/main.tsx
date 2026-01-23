import { Devvit } from '@devvit/public-api';

// Configure app capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Settings for subreddit moderators
Devvit.addSettings([
  {
    type: 'select',
    name: 'autoRemovalMode',
    label: 'Auto-Remove Solved Posts',
    helpText: 'Automatically remove posts when marked as solved',
    options: [
      { label: 'Off (keep posts)', value: 'off' },
      { label: 'Remove immediately when solved', value: 'on_solved' },
      { label: 'Remove 48 hours after solved', value: 'after_48h' },
    ],
    defaultValue: ['off'],
  },
]);

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
    const { reddit, redis, ui, settings, scheduler } = context;
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

      const solvedAt = Date.now();

      // Track in Redis
      await redis.hSet(`post:${postId}`, {
        status: 'solved',
        solvedAt: solvedAt.toString(),
        solvedBy: context.userId!,
      });

      // Increment solved counter for subreddit
      await redis.incrBy(`stats:${subredditName}:solved`, 1);

      // If comment ID provided, pin it
      const commentId = event.values.commentId?.trim();
      if (commentId) {
        try {
          const comment = await reddit.getCommentById(commentId);

          await reddit.submitComment({
            id: postId,
            text: `✅ **Solution by u/${comment.authorName}:**\n\n` +
              `> ${comment.body}\n\n` +
              `---\n\n` +
              `*This post has been marked as solved. Thank you!*`,
          });
        } catch (err) {
          console.error('Failed to pin comment:', err);
        }
      }

      // Handle auto-removal based on setting
      try {
        const autoRemovalMode = await settings.get<string[]>('autoRemovalMode');
        const mode = autoRemovalMode?.[0] || 'off';

        if (mode === 'on_solved') {
          // Remove immediately
          await reddit.remove(postId, false);
          console.log(`Post ${postId} removed immediately (on_solved mode)`);
        } else if (mode === 'after_48h') {
          // Schedule removal for 48 hours later
          const removeAt = new Date(solvedAt + 48 * 60 * 60 * 1000);
          await scheduler.runJob({
            name: 'auto-remove-post',
            runAt: removeAt,
            data: { postId, subredditName },
          });
          console.log(
            `Post ${postId} scheduled for removal at ${removeAt.toISOString()}`
          );
        }
      } catch (removalErr) {
        console.error('Failed to handle auto-removal:', removalErr);
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

// Scheduler Job: Auto-remove post after 48 hours
Devvit.addSchedulerJob({
  name: 'auto-remove-post',
  onRun: async (event, context) => {
    const { reddit, redis } = context;
    const { postId, subredditName } = event.data as {
      postId: string;
      subredditName: string;
    };

    try {
      // Check if post still exists and is still marked as solved
      const postData = await redis.hGetAll(`post:${postId}`);

      if (postData?.status !== 'solved') {
        console.log(`Post ${postId} is no longer solved, skipping removal`);
        return;
      }

      // Try to get the post to verify it still exists
      try {
        await reddit.getPostById(postId);
      } catch {
        console.log(`Post ${postId} no longer exists, skipping removal`);
        return;
      }

      // Remove the post
      await reddit.remove(postId, false);
      console.log(`Post ${postId} auto-removed after 48h (after_48h mode)`);
    } catch (error) {
      console.error(`Failed to auto-remove post ${postId}:`, error);
    }
  },
});

// Menu Action: Mark as Solved (visible to OPs and mods)
Devvit.addMenuItem({
  label: '✓ Mark as Solved',
  location: 'post',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    const post = await reddit.getPostById(context.postId!);
    const currentUser = await reddit.getCurrentUser();

    if (!currentUser) {
      ui.showToast({
        text: 'Please log in to use this feature',
        appearance: 'neutral',
      });
      return;
    }

    // Check if user is a moderator
    const mods = await reddit
      .getModerators({
        subredditName: context.subredditName!,
        username: currentUser.username,
      })
      .all();
    const isMod = mods.length > 0;

    // Only allow post author or mods
    if (post.authorName !== currentUser.username && !isMod) {
      ui.showToast({
        text: 'Only the post author or mods can mark as solved',
        appearance: 'neutral',
      });
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

// Scheduler Job: update stats wiki daily
Devvit.addSchedulerJob({
  name: 'update-stats-wiki',
  onRun: async (_event, context) => {
    const { reddit, redis, subredditName } = context;
    if (!subredditName) return;

    try {
      const total =
        (await redis.get(`stats:${subredditName}:total`)) || '0';
      const solved =
        (await redis.get(`stats:${subredditName}:solved`)) || '0';
      const solvedRate =
        parseInt(total) > 0
          ? ((parseInt(solved) / parseInt(total)) * 100).toFixed(1)
          : '0.0';

      const wikiContent =
        `# SolvedBot Statistics\n\n` +
        `**Total Posts Tracked:** ${total}\n\n` +
        `**Posts Marked Solved:** ${solved}\n\n` +
        `**Solve Rate:** ${solvedRate}%\n\n` +
        `---\n\n` +
        `*Last updated: ${new Date().toUTCString()}*\n\n` +
        `*Powered by SolvedBot*`;

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

// Schedule the stats job on install/upgrade
Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: async (_event, context) => {
    try {
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

    const currentUser = await context.reddit.getCurrentUser();
    if (!currentUser || !subredditName) return;

    const mods = await context.reddit
      .getModerators({
        subredditName,
        username: currentUser.username,
      })
      .all();

    if (mods.length === 0) {
      ui.showToast({
        text: 'Stats are mod-only',
        appearance: 'neutral',
      });
      return;
    }

    const total =
      (await redis.get(`stats:${subredditName}:total`)) || '0';
    const solved =
      (await redis.get(`stats:${subredditName}:solved`)) || '0';
    const solvedRate =
      parseInt(total) > 0
        ? ((parseInt(solved) / parseInt(total)) * 100).toFixed(1)
        : '0';

    ui.showToast({
      text: `📊 ${solved}/${total} solved (${solvedRate}%)`,
      appearance: 'success',
    });
  },
});

export default Devvit;