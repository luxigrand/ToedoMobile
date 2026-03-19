import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ToedoLogo } from '@/components/toedo-logo';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

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
      <TouchableOpacity onPress={() => handleToggle(item)} style={styles.todoCheckWrap}>
        <View style={[styles.circle, item.completed && styles.circleDone]} />
      </TouchableOpacity>
      <Text style={[styles.todoText, item.completed && styles.todoDone]}>{item.text}</Text>
      <TouchableOpacity onPress={() => handleDeleteTodo(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color="#555" />
      </TouchableOpacity>
    </View>
  );

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
              placeholder="Enter workspace ID"
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
