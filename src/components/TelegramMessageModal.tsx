import React, { useState, useEffect } from 'react';
import { Student, MessageTemplate } from '../lib/types';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { X, Send, Plus, Trash2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/utils';

interface Props {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
}

export default function TelegramMessageModal({ student, isOpen, onClose }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  
  // New template states
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(query(collection(db, 'message_templates')), (snapshot) => {
      setTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MessageTemplate)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'message_templates', auth);
    });
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tId = e.target.value;
    setSelectedTemplateId(tId);
    if (tId) {
      const t = templates.find(temp => temp.id === tId);
      if (t) setMessageText(t.text);
    } else {
      setMessageText('');
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateTitle.trim() || !newTemplateText.trim()) return;
    try {
      await addDoc(collection(db, 'message_templates'), {
        title: newTemplateTitle.trim(),
        text: newTemplateText.trim()
      });
      setIsCreatingTemplate(false);
      setNewTemplateTitle('');
      setNewTemplateText('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'message_templates', auth);
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Удалить этот шаблон?')) return;
    try {
      await deleteDoc(doc(db, 'message_templates', id));
      if (selectedTemplateId === id) {
        setSelectedTemplateId('');
        setMessageText('');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'message_templates', auth);
    }
  };

  const handleSend = () => {
    const hasTelegramUsername = !!student.telegramUsername?.trim();
    const hasPhone = !!student.phone?.trim();

    if (!hasTelegramUsername && !hasPhone) {
      alert("Невозможно отправить сообщение: у клиента не указан ни никнейм Telegram, ни номер телефона.");
      return;
    }

    const text = encodeURIComponent(messageText);
    let url = '';

    if (hasTelegramUsername) {
      let username = student.telegramUsername!.trim();
      if (username.startsWith('@')) username = username.substring(1);
      url = `https://t.me/${username}?text=${text}`;
    } else if (hasPhone) {
      // Remove any non-digit characters except the leading +
      let phone = student.phone!.trim();
      if (!phone.startsWith('+')) phone = '+' + phone;
      const cleanPhone = '+' + phone.replace(/[^\d]/g, '');
      url = `https://t.me/${cleanPhone}?text=${text}`;
    }

    window.open(url, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Отправить в Telegram</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded-md border border-blue-100">
            Сообщение будет отправлено через Telegram приложение/веб. 
            Сначала будет использован <b>Никнейм (@username)</b>. Если его нет, откроется диалог по <b>Номеру телефона</b>.
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-end mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Выберите шаблон (опционально)
              </label>
              <button 
                onClick={() => setIsCreatingTemplate(!isCreatingTemplate)}
                className="text-indigo-600 hover:text-indigo-900 text-sm flex items-center gap-1"
              >
                {isCreatingTemplate ? 'Отмена' : <><Plus className="w-4 h-4"/> Новый шаблон</>}
              </button>
            </div>
            
            {isCreatingTemplate ? (
              <div className="border border-indigo-100 bg-indigo-50 p-3 rounded-md mb-4 space-y-3">
                <input
                  type="text"
                  value={newTemplateTitle}
                  onChange={e => setNewTemplateTitle(e.target.value)}
                  placeholder="Название шаблона (напр. 'Приветствие')"
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <textarea
                  value={newTemplateText}
                  onChange={e => setNewTemplateText(e.target.value)}
                  placeholder="Текст сообщения..."
                  rows={3}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <button
                  onClick={handleCreateTemplate}
                  disabled={!newTemplateTitle.trim() || !newTemplateText.trim()}
                  className="w-full bg-indigo-600 text-white rounded-md py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Сохранить шаблон
                </button>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedTemplateId}
                  onChange={handleTemplateChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm appearance-none pr-8"
                >
                  <option value="">-- Без шаблона --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                {selectedTemplateId && (
                  <button 
                    onClick={(e) => handleDeleteTemplate(selectedTemplateId, e)}
                    className="absolute right-2 top-2 text-red-400 hover:text-red-600"
                    title="Удалить шаблон"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Текст сообщения
            </label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={6}
              className="w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
              placeholder="Напишите сообщение..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSend}
            disabled={!messageText.trim()}
            className="flex items-center gap-2 px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#0088cc] hover:bg-[#0077b3] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0088cc] disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Перейти в Telegram
          </button>
        </div>
      </div>
    </div>
  );
}
