# 🤖 SolvedBot

Automate solution tracking for your Reddit Q&A community

SolvedBot helps moderators and community members easily track which questions have been answered in subreddits focused on help, support, and Q&A.

## ✨ Features

- **Automatic "Solved" Flair**: Mark posts as solved with a simple command
- **User-Friendly Commands**: Let OPs mark their own questions as solved
- **Moderator Tools**: Full control over solution tracking
- **Auto-Remove Solved Posts**: Automatically remove solved posts immediately or after a delay
- **Clean Interface**: Simple post menu actions and commands
- **Free & Open Source**: No hidden costs, completely transparent

## 🚀 Getting Started

### For Moderators

1. Visit [Reddit Apps & Tools](https://developers.reddit.com/apps)
2. Navigate to Apps & Tools
3. Find SolvedBot and click "Install"
4. Configure your settings (flair text, permissions, auto-removal, etc.)

### For Community Members

Once installed by moderators, you can mark your post as solved:

#### Method 1: Post Menu

- Open your post
- Click the three dots menu (•••)
- Select "Mark as Solved"

#### Method 2: Comment Command

- Comment `!solved` on your own post
- SolvedBot will automatically update the flair

## 🎯 Perfect For

- Tech support subreddits
- Q&A communities
- Help desks and troubleshooting forums
- Tutorial request communities
- Any subreddit where tracking solved questions matters

## 🔧 Configuration Options

- **Custom flair text** (default: "Solved")
- **Moderator-only vs. OP-enabled marking**
- **Auto-lock solved posts** (optional)
- **Auto-Remove Solved Posts**: 
  - Off (keep posts visible)
  - Remove immediately when marked solved
  - Remove 48 hours after being marked solved
- **Custom success messages**
- And more...

## 📊 Why Use SolvedBot?

- **Better UX**: Clear visual indication of resolved issues
- **Community Engagement**: Users feel valued when their solutions are recognized
- **Search Optimization**: Easier for users to find unanswered questions
- **Analytics Ready**: Track solve rates and community health
- **Flexible Moderation**: Auto-remove solved posts to keep your feed clean

## 💻 Commands

| Command | Description | Who Can Use |
|---------|-------------|-------------|
| `!solved` | Mark post as solved | Post author (OP) |
| Post menu → "Mark as Solved" | Mark via UI | Post author (OP) |
| Mod actions | Full control | Moderators |

## 💬 Support & Feedback

- **Issues**: [GitHub Issues](https://github.com/yourusername/solvedbot2/issues)
- **Questions**: Contact via modmail or Reddit DM

## 📈 Stats & Analytics

SolvedBot tracks:
- Total posts monitored
- Posts marked as solved
- Solve rate percentage
- Daily wiki updates with statistics

View stats via the "📊 View SolvedBot Stats" menu action (moderators only).

## 🔐 Privacy & Permissions

SolvedBot requires:
- **Reddit API** access (moderator scope) for flair management
- **Redis** for tracking post status and statistics
- **Scheduler** for delayed auto-removal and daily stats updates

All data is stored securely and never shared with third parties.

## 📝 License

Open source - feel free to contribute or fork!

---

*Made with ❤️ for Reddit communities*
