import { ToedoLogo } from '@/components/toedo-logo';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Workspace = {
  id: number;
  name: string;
  user_id: string;
  is_public: boolean;
  password: string | null;
};

type Todo = {
  id: number;
  text: string;
  completed: boolean;
  workspace_id: number;
};

const JOINED_WS_KEY = 'toedo_joined_workspace_ids';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [todosLoading, setTodosLoading] = useState(false);

  // Create workspace modal
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cPublic, setCPublic] = useState(false);
  const [cPassword, setCPassword] = useState('');
  const [cLoading, setCLoading] = useState(false);
  const [showVisibilityOptions, setShowVisibilityOptions] = useState(false);

  // Join workspace modal
  const [showJoin, setShowJoin] = useState(false);
  const [jId, setJId] = useState('');
  const [jPassword, setJPassword] = useState('');
  const [jLoading, setJLoading] = useState(false);
  const [jError, setJError] = useState('');

  // New todo modal
  const [showNewTodo, setShowNewTodo] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTodoLoading, setNewTodoLoading] = useState(false);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [menuWs, setMenuWs] = useState<Workspace | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showEditWs, setShowEditWs] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [wsActionLoading, setWsActionLoading] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) return;
    setWsLoading(true);

    const { data: owned } = await supabase
      .from('workspace')
      .select('id, name, user_id, is_public, password')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const raw = await AsyncStorage.getItem(JOINED_WS_KEY);
    const joinedIds: number[] = raw ? JSON.parse(raw) : [];

    let joined: Workspace[] = [];
    if (joinedIds.length > 0) {
      const { data } = await supabase
        .from('workspace')
        .select('id, name, user_id, is_public, password')
        .in('id', joinedIds)
        .neq('user_id', user.id);
      joined = (data as Workspace[]) ?? [];
    }

    const all = [...((owned as Workspace[]) ?? []), ...joined];
    setWorkspaces(all);
    setSelectedWsId(prev => (prev === null && all.length > 0 ? all[0].id : prev));
    setWsLoading(false);
  }, [user]);

  const fetchTodos = useCallback(async (showSpinner = false) => {
    if (!selectedWsId) {
      setTodos([]);
      return;
    }
    if (showSpinner) setTodosLoading(true);
    const { data } = await supabase
      .from('todo')
      .select('id, text, completed, workspace_id')
      .eq('workspace_id', selectedWsId)
      .order('created_at', { ascending: true });
    setTodos((data as Todo[]) ?? []);
    if (showSpinner) setTodosLoading(false);
  }, [selectedWsId]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    fetchTodos(true);
    const interval = setInterval(() => fetchTodos(false), 5000);
    return () => clearInterval(interval);
  }, [fetchTodos]);

  const handleCreateWorkspace = async () => {
    if (!cName.trim() || !user) return;
    setCLoading(true);
    const { data, error } = await supabase
      .from('workspace')
      .insert({
        name: cName.trim(),
        is_public: cPublic,
        password: cPassword.trim() || null,
        user_id: user.id,
      })
      .select('id, name, user_id, is_public, password')
      .single();

    if (!error && data) {
      setWorkspaces(prev => [...prev, data as Workspace]);
      setSelectedWsId((data as Workspace).id);
    }
    setCLoading(false);
    setShowCreate(false);
    setCName('');
    setCPublic(false);
    setCPassword('');
    setShowVisibilityOptions(false);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCName('');
    setCPublic(false);
    setCPassword('');
    setShowVisibilityOptions(false);
  };

  const handleJoinWorkspace = async () => {
    const numId = parseInt(jId.trim(), 10);
    if (isNaN(numId)) {
      setJError('Invalid workspace ID.');
      return;
    }
    setJLoading(true);
    setJError('');

    const { data, error } = await supabase
      .from('workspace')
      .select('id, name, user_id, is_public, password')
      .eq('id', numId)
      .single();

    if (error || !data) {
      setJError('Workspace not found.');
      setJLoading(false);
      return;
    }

    const ws = data as Workspace;
    if (ws.password && ws.password !== jPassword) {
      setJError('Wrong password.');
      setJLoading(false);
      return;
    }

    const raw = await AsyncStorage.getItem(JOINED_WS_KEY);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(ws.id)) {
      await AsyncStorage.setItem(JOINED_WS_KEY, JSON.stringify([...ids, ws.id]));
    }

    setWorkspaces(prev => (prev.find(w => w.id === ws.id) ? prev : [...prev, ws]));
    setSelectedWsId(ws.id);
    setJLoading(false);
    setShowJoin(false);
    setJId('');
    setJPassword('');
  };

  const closeJoin = () => {
    setShowJoin(false);
    setJId('');
    setJPassword('');
    setJError('');
  };

  const handleCreateTodo = async () => {
    if (!newText.trim() || !selectedWsId || !user) return;
    setNewTodoLoading(true);
    const { data, error } = await supabase
      .from('todo')
      .insert({
        text: newText.trim(),
        workspace_id: selectedWsId,
        user_id: user.id,
      })
      .select('id, text, completed, workspace_id')
      .single();

    if (!error && data) setTodos(prev => [...prev, data as Todo]);
    setNewTodoLoading(false);
    setShowNewTodo(false);
    setNewText('');
  };

  const closeNewTodo = () => {
    setShowNewTodo(false);
    setNewText('');
  };

  const closeWsMenu = () => {
    setShowWsMenu(false);
    setMenuWs(null);
  };

  const openWorkspaceMenu = (ws: Workspace, ev: GestureResponderEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setMenuWs(ws);
    setMenuPos({ x: ev.nativeEvent.pageX, y: ev.nativeEvent.pageY });
    setShowWsMenu(true);
  };

  const openEditWorkspace = () => {
    if (!menuWs) return;
    setEditName(menuWs.name);
    setEditPublic(menuWs.is_public);
    setEditPassword(menuWs.password ?? '');
    setShowWsMenu(false);
    setShowEditWs(true);
  };

  const closeEditWorkspace = () => {
    setShowEditWs(false);
    setEditName('');
    setEditPublic(false);
    setEditPassword('');
    setMenuWs(null);
  };

  const handleUpdateWorkspace = async () => {
    if (!menuWs || !editName.trim()) return;
    if (menuWs.user_id !== user?.id) {
      Alert.alert('Not allowed', 'Only the workspace owner can edit this workspace.');
      return;
    }
    setWsActionLoading(true);
    const payload = {
      name: editName.trim(),
      is_public: editPublic,
      password: editPublic ? null : (editPassword.trim() || null),
    };
    const { data, error } = await supabase
      .from('workspace')
      .update(payload)
      .eq('id', menuWs.id)
      .select('id, name, user_id, is_public, password')
      .single();

    if (!error && data) {
      setWorkspaces(prev => prev.map(ws => (ws.id === menuWs.id ? (data as Workspace) : ws)));
      setMenuWs(data as Workspace);
      setShowEditWs(false);
    }
    setWsActionLoading(false);
  };

  const handleToggleWorkspaceVisibility = async () => {
    if (!menuWs) return;
    if (menuWs.user_id !== user?.id) {
      Alert.alert('Not allowed', 'Only the workspace owner can change visibility.');
      return;
    }
    const nextPublic = !menuWs.is_public;
    const { data, error } = await supabase
      .from('workspace')
      .update({ is_public: nextPublic, password: nextPublic ? null : menuWs.password })
      .eq('id', menuWs.id)
      .select('id, name, user_id, is_public, password')
      .single();

    if (!error && data) {
      setWorkspaces(prev => prev.map(ws => (ws.id === menuWs.id ? (data as Workspace) : ws)));
      setMenuWs(data as Workspace);
    }
    setShowWsMenu(false);
  };

  const removeJoinedWorkspace = async (wsId: number) => {
    const raw = await AsyncStorage.getItem(JOINED_WS_KEY);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(JOINED_WS_KEY, JSON.stringify(ids.filter(id => id !== wsId)));
  };

  const handleDeleteWorkspace = () => {
    if (!menuWs) return;
    const wsToDelete = menuWs;
    Alert.alert(
      'Delete workspace',
      `"${wsToDelete.name}" workspace will be removed. Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (wsToDelete.user_id === user?.id) {
              await supabase.from('workspace').delete().eq('id', wsToDelete.id);
            } else {
              await removeJoinedWorkspace(wsToDelete.id);
            }
            setWorkspaces(prev => prev.filter(ws => ws.id !== wsToDelete.id));
            setSelectedWsId(prev => (prev === wsToDelete.id ? null : prev));
            setShowWsMenu(false);
            setMenuWs(null);
          },
        },
      ]
    );
  };

  const handleShareWorkspace = async () => {
    if (!menuWs) return;
    const shareMessage =
      `Benim workspace'ime katil:\n` +
      `Workspace ID: ${menuWs.id}\n` +
      `Uygulama: ToedoMobile\n` +
      `Uygulamaya girip "Join" bolumunden bu ID'yi yazarak katilabilirsin.`;

    const waUrl = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
    try {
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Share.share({ message: shareMessage });
      }
    } catch {
      await Share.share({ message: shareMessage });
    } finally {
      setShowWsMenu(false);
    }
  };

  const handleToggle = async (todo: Todo) => {
    const next = !todo.completed;
    setTodos(prev => prev.map(t => (t.id === todo.id ? { ...t, completed: next } : t)));
    await supabase.from('todo').update({ completed: next }).eq('id', todo.id);
  };

  const handleDeleteTodo = async (id: number) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    await supabase.from('todo').delete().eq('id', id);
  };

  const renderTodo = ({ item }: { item: Todo }) => (
    <View style={styles.todoRow}>
      <TouchableOpacity onPress={() => handleToggle(item)} style={styles.todoMainPressable} activeOpacity={0.7}>
        <View style={styles.todoCheckWrap}>
          <View style={[styles.circle, item.completed && styles.circleDone]} />
        </View>
        <Text style={[styles.todoText, item.completed && styles.todoDone]}>{item.text}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteTodo(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color="#555" />
      </TouchableOpacity>
    </View>
  );

  const menuWidth = 230;
  const screenWidth = Dimensions.get('window').width;
  const menuLeft = Math.max(12, Math.min(menuPos.x - menuWidth / 2, screenWidth - menuWidth - 12));

  return (
    <SafeAreaView style={styles.container}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <ToedoLogo width={110} height={28} />
      </View>

      {/* Workspaces header */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>Workspaces</Text>
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.pillBtn} onPress={() => setShowJoin(true)}>
            <Text style={styles.pillBtnText}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pillBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.pillBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Workspace tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {wsLoading ? (
          <ActivityIndicator color="#fff" style={{ marginLeft: 16 }} />
        ) : (
          workspaces.map(ws => (
            <TouchableOpacity
              key={ws.id}
              onPress={() => setSelectedWsId(ws.id)}
              onLongPress={(ev) => openWorkspaceMenu(ws, ev)}
              delayLongPress={300}
              style={[styles.tab, selectedWsId === ws.id && styles.tabActive]}
            >
              <Text style={[styles.tabText, selectedWsId === ws.id && styles.tabTextActive]}>
                {ws.name}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Tasks card */}
      <View style={styles.tasksCard}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Tasks</Text>
          {selectedWsId != null && (
            <TouchableOpacity style={styles.pillBtn} onPress={() => setShowNewTodo(true)}>
              <Text style={styles.pillBtnText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>

        {todosLoading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={todos}
            keyExtractor={item => item.id.toString()}
            renderItem={renderTodo}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {selectedWsId == null
                  ? 'Select or create a workspace to get started.'
                  : 'No tasks yet. Tap "+ New" to add one.'}
              </Text>
            }
          />
        )}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out ({user?.email})</Text>
      </TouchableOpacity>

      {/* ── CREATE WORKSPACE MODAL ── */}
      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={closeCreate}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCreate} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Workspace</Text>
              <TouchableOpacity onPress={closeCreate}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter workspace nickname"
              placeholderTextColor="#444"
              value={cName}
              onChangeText={setCName}
            />

            <Text style={styles.inputLabel}>Visibility</Text>
            <TouchableOpacity
              style={styles.selectBox}
              onPress={() => setShowVisibilityOptions(v => !v)}
            >
              <Text style={styles.selectText}>{cPublic ? 'Public' : 'Private'}</Text>
              <Ionicons name="chevron-down" size={15} color="#666" />
            </TouchableOpacity>
            {showVisibilityOptions && (
              <View style={styles.selectOptions}>
                <TouchableOpacity
                  style={styles.selectOption}
                  onPress={() => { setCPublic(false); setShowVisibilityOptions(false); }}
                >
                  <Text style={styles.selectOptionText}>Private</Text>
                </TouchableOpacity>
                <View style={styles.selectDivider} />
                <TouchableOpacity
                  style={styles.selectOption}
                  onPress={() => { setCPublic(true); setShowVisibilityOptions(false); }}
                >
                  <Text style={styles.selectOptionText}>Public</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.inputLabel, { marginTop: showVisibilityOptions ? 0 : 0 }]}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor="#444"
              value={cPassword}
              onChangeText={setCPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.primaryBtn, (!cName.trim() || cLoading) && styles.primaryBtnDisabled]}
              onPress={handleCreateWorkspace}
              disabled={!cName.trim() || cLoading}
            >
              {cLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.primaryBtnText}>Join</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── JOIN WORKSPACE MODAL ── */}
      <Modal
        visible={showJoin}
        transparent
        animationType="fade"
        onRequestClose={closeJoin}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeJoin} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join Workspace</Text>
              <TouchableOpacity onPress={closeJoin}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Workspace ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter workspace ID"
              placeholderTextColor="#444"
              value={jId}
              onChangeText={setJId}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Password (if has set)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor="#444"
              value={jPassword}
              onChangeText={setJPassword}
              secureTextEntry
            />

            {jError ? <Text style={styles.errorText}>{jError}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, (!jId.trim() || jLoading) && styles.primaryBtnDisabled]}
              onPress={handleJoinWorkspace}
              disabled={!jId.trim() || jLoading}
            >
              {jLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.primaryBtnText}>Join</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── NEW TASK MODAL ── */}
      <Modal
        visible={showNewTodo}
        transparent
        animationType="fade"
        onRequestClose={closeNewTodo}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNewTodo} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Task</Text>
              <TouchableOpacity onPress={closeNewTodo}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, styles.taskInput]}
              placeholder="What needs to be done?"
              placeholderTextColor="#444"
              value={newText}
              onChangeText={setNewText}
              multiline
              autoFocus
            />

            <TouchableOpacity
              style={[styles.primaryBtn, (!newText.trim() || newTodoLoading) && styles.primaryBtnDisabled]}
              onPress={handleCreateTodo}
              disabled={!newText.trim() || newTodoLoading}
            >
              {newTodoLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.primaryBtnText}>Add Task</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── WORKSPACE ACTION MENU ── */}
      <Modal
        visible={showWsMenu}
        transparent
        animationType="fade"
        onRequestClose={closeWsMenu}
      >
        <Pressable style={styles.wsMenuOverlay} onPress={closeWsMenu}>
          <View style={[styles.wsMenuCard, { left: menuLeft, top: menuPos.y + 10, width: menuWidth }]}>
            <Text style={styles.wsMenuTitle}>{menuWs?.name ?? 'Workspace'}</Text>
            <Text style={styles.wsMenuSubTitle}>Workspace ID: {menuWs?.id ?? '-'}</Text>
            <TouchableOpacity style={styles.wsMenuItem} onPress={handleShareWorkspace}>
              <Text style={styles.wsMenuItemText}>Share (WhatsApp)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.wsMenuItem} onPress={openEditWorkspace}>
              <Text style={styles.wsMenuItemText}>Rename / Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.wsMenuItem} onPress={handleToggleWorkspaceVisibility}>
              <Text style={styles.wsMenuItemText}>
                {menuWs?.is_public ? 'Make Private' : 'Make Public'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.wsMenuItem} onPress={handleDeleteWorkspace}>
              <Text style={[styles.wsMenuItemText, styles.wsMenuDanger]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── EDIT WORKSPACE MODAL ── */}
      <Modal
        visible={showEditWs}
        transparent
        animationType="fade"
        onRequestClose={closeEditWorkspace}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditWorkspace} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Workspace</Text>
              <TouchableOpacity onPress={closeEditWorkspace}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Workspace name"
              placeholderTextColor="#444"
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={styles.inputLabel}>Visibility</Text>
            <View style={styles.visibilityRow}>
              <TouchableOpacity
                style={[styles.visibilityPill, !editPublic && styles.visibilityPillActive]}
                onPress={() => setEditPublic(false)}
              >
                <Text style={[styles.visibilityPillText, !editPublic && styles.visibilityPillTextActive]}>
                  Private
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityPill, editPublic && styles.visibilityPillActive]}
                onPress={() => setEditPublic(true)}
              >
                <Text style={[styles.visibilityPillText, editPublic && styles.visibilityPillTextActive]}>
                  Public
                </Text>
              </TouchableOpacity>
            </View>

            {!editPublic && (
              <>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Optional password"
                  placeholderTextColor="#444"
                  value={editPassword}
                  onChangeText={setEditPassword}
                  secureTextEntry
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, (!editName.trim() || wsActionLoading) && styles.primaryBtnDisabled]}
              onPress={handleUpdateWorkspace}
              disabled={!editName.trim() || wsActionLoading}
            >
              {wsActionLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.primaryBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e0e',
  },
  logoRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pillBtn: {
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillBtnText: {
    color: '#ccc',
    fontSize: 13,
  },
  tabsScroll: {
    flexGrow: 0,
    marginBottom: 14,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  tabActive: {
    backgroundColor: '#1e1e1e',
    borderColor: '#4a4a4a',
  },
  tabText: {
    color: '#555',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#fff',
  },
  wsMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  wsMenuCard: {
    position: 'absolute',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    borderRadius: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  wsMenuTitle: {
    color: '#9a9a9a',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  wsMenuSubTitle: {
    color: '#777',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  wsMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  wsMenuItemText: {
    color: '#e6e6e6',
    fontSize: 14,
  },
  wsMenuDanger: {
    color: '#e05c5c',
  },
  tasksCard: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1c',
  },
  todoMainPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  todoCheckWrap: {
    marginRight: 10,
    marginTop: 2,
  },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#4a4a4a',
  },
  circleDone: {
    backgroundColor: '#3a3a3a',
    borderColor: '#3a3a3a',
  },
  todoText: {
    flex: 1,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  todoDone: {
    color: '#444',
    textDecorationLine: 'line-through',
  },
  deleteBtn: {
    paddingLeft: 8,
    marginTop: 1,
  },
  emptyText: {
    color: '#444',
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
  signOutBtn: {
    marginHorizontal: 16,
    marginVertical: 14,
    paddingVertical: 14,
    backgroundColor: '#141414',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  signOutText: {
    color: '#666',
    fontSize: 14,
  },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  modalClose: {
    color: '#666',
    fontSize: 17,
  },
  inputLabel: {
    color: '#666',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0e0e0e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  taskInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0e0e0e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  selectText: {
    color: '#fff',
    fontSize: 14,
  },
  selectOptions: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 14,
    overflow: 'hidden',
  },
  selectOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  selectOptionText: {
    color: '#ccc',
    fontSize: 14,
  },
  selectDivider: {
    height: 1,
    backgroundColor: '#222',
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  visibilityPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#101010',
  },
  visibilityPillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  visibilityPillText: {
    color: '#bbb',
    fontSize: 14,
  },
  visibilityPillTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.35,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#e05c5c',
    fontSize: 13,
    marginBottom: 10,
  },
});
