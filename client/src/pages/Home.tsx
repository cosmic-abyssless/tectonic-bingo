import { useAuth } from "../context/AuthContext";
import { avatarUrl } from "../types";

export function Home() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img
          src={avatarUrl(user)}
          alt="avatar"
          style={styles.avatar}
        />
        <div style={styles.info}>
          <h2 style={styles.name}>
            {user.global_name ?? user.username}
          </h2>
          <p style={styles.tag}>@{user.username}</p>
          {user.email && <p style={styles.email}>{user.email}</p>}
        </div>
        <button onClick={logout} style={styles.logoutButton}>
          Log out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1a1a2e",
  },
  card: {
    background: "#16213e",
    borderRadius: 12,
    padding: "40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    minWidth: 300,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    border: "3px solid #5865F2",
  },
  info: {
    textAlign: "center",
  },
  name: {
    color: "#ffffff",
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
  },
  tag: {
    color: "#8e9297",
    margin: "4px 0 0",
    fontSize: 14,
  },
  email: {
    color: "#b9bbbe",
    margin: "4px 0 0",
    fontSize: 13,
  },
  logoutButton: {
    background: "transparent",
    border: "1px solid #4f545c",
    color: "#b9bbbe",
    borderRadius: 6,
    padding: "8px 20px",
    fontSize: 14,
    cursor: "pointer",
    marginTop: 8,
  },
};
