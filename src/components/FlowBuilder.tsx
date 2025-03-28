import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronRight, Maximize2, Database } from 'lucide-react';

// Типы блоков - добавляем Collection
type BlockType = 'Action' | 'Table' | 'Switch' | 'Start' | 'End' | 'SwitchEnd' | 'Flow' | 'Collection' | 'CollectionEnd';

// Интерфейс для блока
interface Block {
  id: string;
  type: BlockType;
  title: string;
  position: { x: number; y: number };
  connections: {
    top: string | null;
    bottom: string[];
  };
  // Свойства для SubFlow и Flow блоков
  children?: string[]; // ID дочерних блоков
  collapsed?: boolean; // Состояние сворачивания
  originalHeight?: number; // Исходная высота для сохранения при сворачивании
  parentFlow?: string | null; // ID родительского Flow блока, если этот блок находится внутри Flow
  zIndex: number; // Z-index для управления наложением блоков

  // Дополнительные свойства для Flow и Collection
  width?: number;
  height?: number;

  // Свойство для определения пары Collection/CollectionEnd
  pairedWithId?: string; // ID блока, с которым связан данный блок (для пары Collection-CollectionEnd)
  internalBlocks?: string[]; // ID блоков внутри Collection (между Collection и CollectionEnd)
}

// Интерфейс для соединения
interface Connection {
  from: { id: string; point: 'top' | 'bottom' };
  to: { id: string; point: 'top' | 'bottom' };
}

const FLOW_PADDING = 40; // Отступ внутри Flow
const FLOW_MIN_HEIGHT = 300; // Минимальная высота Flow
const FLOW_MIN_WIDTH = 400; // Минимальная ширина Flow
const BLOCK_HEIGHT = 80; // Высота блока
const COLLECTION_BLOCK_HEIGHT = 40; // Высота блока Collection
const BLOCK_SPACING = 20; // Расстояние между блоками
const COLLECTION_DEFAULT_GAP = 2 * BLOCK_HEIGHT; // Стандартное расстояние между Collection и CollectionEnd

// Добавляем CSS переменные для эффектов
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  :root {
    --flow-hover-opacity: 0.4;
  }
`;
document.head.appendChild(styleSheet);

const FlowBuilder = () => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [draggedBlock, setDraggedBlock] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [selectedBlockType, setSelectedBlockType] = useState<BlockType>('Action');
  const [connecting, setConnecting] = useState<{ blockId: string; point: 'top' | 'bottom' } | null>(null);
  const [hoveredFlow, setHoveredFlow] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nextZIndex, setNextZIndex] = useState<number>(1); // Отслеживаем следующий z-index

  // Аудио для воспроизведения при подключении блоков
  const connectSoundRef = useRef<HTMLAudioElement | null>(null);

  // Отслеживаем счетчик для нумерации Switch блоков
  const [switchCounter, setSwitchCounter] = useState<number>(1);
  // Счетчик для Flow блоков
  const [flowCounter, setFlowCounter] = useState<number>(1);
  // Счетчик для Collection блоков
  const [collectionCounter, setCollectionCounter] = useState<number>(1);

  // Состояние для отображения/скрытия подсказок
  const [showHints, setShowHints] = useState<boolean>(false);

  // Создаем аудио-элемент при монтировании компонента
  useEffect(() => {
    // Создаем аудио элемент
    connectSoundRef.current = new Audio();

    // Путь к звуковому файлу (замените на реальный путь к вашему файлу)
    connectSoundRef.current.src = '/sounds/connect-sound.mp3';

    // Настраиваем громкость
    connectSoundRef.current.volume = 0.5;

    // Предзагружаем аудио
    connectSoundRef.current.load();

    return () => {
      // Очищаем ресурс при размонтировании
      if (connectSoundRef.current) {
        connectSoundRef.current.pause();
        connectSoundRef.current = null;
      }
    };
  }, []);

  // Функция для воспроизведения звука подключения
  const playConnectSound = () => {
    // Проверяем, создан ли звуковой элемент
    if (connectSoundRef.current) {
      // Сбрасываем воспроизведение, если звук уже играет
      connectSoundRef.current.currentTime = 0;

      // Запускаем воспроизведение
      connectSoundRef.current.play().catch(error => {
        // Обрабатываем ошибки воспроизведения (например, если пользователь не взаимодействовал со страницей)
        console.warn('Не удалось воспроизвести звук подключения:', error);
      });
    }
  };

  // Получение нового значения z-index и инкремент счетчика
  const getNextZIndex = () => {
    const currentZIndex = nextZIndex;
    setNextZIndex(currentZIndex + 1);
    return currentZIndex;
  };

  // Обновление позиции CollectionEnd блока в зависимости от внутренних блоков
  const updateCollectionEndPosition = (collectionId: string) => {
    const collectionBlock = blocks.find(b => b.id === collectionId && b.type === 'Collection');
    if (!collectionBlock || !collectionBlock.pairedWithId) return;

    const collectionEndId = collectionBlock.pairedWithId;
    const collectionEndBlock = blocks.find(b => b.id === collectionEndId);
    if (!collectionEndBlock) return;

    // Получаем все присоединенные к Collection блоки (через соединения)
    const connectedBlocks: string[] = [];
    collectionBlock.connections.bottom.forEach(blockId => {
      if (blockId !== collectionEndId) {
        connectedBlocks.push(blockId);
        // Также добавляем все блоки, соединенные с этим блоком
        const additionalBlocks = getConnectedBlocksBelow(blockId);
        connectedBlocks.push(...additionalBlocks);
      }
    });

    // Рассчитываем новую позицию для CollectionEnd
    let newYPosition;

    if (connectedBlocks.length === 0) {
      // Если присоединенных блоков нет, устанавливаем стандартное расстояние
      newYPosition = collectionBlock.position.y + COLLECTION_DEFAULT_GAP;
    } else {
      // Находим самый нижний блок среди присоединенных
      let maxBottom = collectionBlock.position.y + COLLECTION_BLOCK_HEIGHT;

      connectedBlocks.forEach(blockId => {
        const block = blocks.find(b => b.id === blockId);
        if (block) {
          const blockPosition = getAbsolutePosition(block);
          const blockHeight = (block.type === 'Collection' || block.type === 'CollectionEnd')
              ? COLLECTION_BLOCK_HEIGHT
              : BLOCK_HEIGHT;
          const blockBottom = blockPosition.y + blockHeight;
          if (blockBottom > maxBottom) {
            maxBottom = blockBottom;
          }
        }
      });

      // Добавляем отступ высотой в один блок после последнего блока
      // Используем высоту блока (BLOCK_HEIGHT) плюс небольшой дополнительный отступ
      newYPosition = maxBottom + BLOCK_HEIGHT + 10;
    }

    // Обновляем позицию CollectionEnd блока
    setBlocks(prev => prev.map(block => {
      if (block.id === collectionEndId) {
        return {
          ...block,
          position: {
            ...block.position,
            x: collectionBlock.position.x, // Сохраняем X координату такой же, как у Collection
            y: newYPosition
          }
        };
      }
      return block;
    }));

    // Обновляем список внутренних блоков Collection
    setBlocks(prev => prev.map(block => {
      if (block.id === collectionId) {
        return {
          ...block,
          internalBlocks: connectedBlocks
        };
      }
      return block;
    }));
  };

  // Проверка, находится ли блок между Collection и CollectionEnd
  const isBlockBetweenCollection = (blockId: string, collectionId: string) => {
    const collectionBlock = blocks.find(b => b.id === collectionId && b.type === 'Collection');
    if (!collectionBlock || !collectionBlock.pairedWithId) return false;

    const collectionEndId = collectionBlock.pairedWithId;
    const blockToCheck = blocks.find(b => b.id === blockId);
    if (!blockToCheck) return false;

    const blockPosition = getAbsolutePosition(blockToCheck);
    const collectionPosition = getAbsolutePosition(collectionBlock);
    const collectionEndBlock = blocks.find(b => b.id === collectionEndId);

    if (!collectionEndBlock) return false;

    const collectionEndPosition = getAbsolutePosition(collectionEndBlock);

    // Проверяем по X, находится ли блок в пределах ширины Collection
    const isWithinXRange =
        blockPosition.x >= collectionPosition.x - 50 &&
        blockPosition.x <= collectionPosition.x + 250; // Добавляем запас по ширине

    // Проверяем по Y, находится ли блок между Collection и CollectionEnd
    // Учитываем уменьшенную высоту для Collection
    const isWithinYRange =
        blockPosition.y > collectionPosition.y + COLLECTION_BLOCK_HEIGHT &&
        blockPosition.y < collectionEndPosition.y;

    return isWithinXRange && isWithinYRange;
  };

  // Добавление блока в Collection
  const addBlockToCollection = (blockId: string, collectionId: string) => {
    const collectionBlock = blocks.find(b => b.id === collectionId && b.type === 'Collection');
    if (!collectionBlock) return;

    // Обновляем список внутренних блоков для Collection
    setBlocks(prev => prev.map(block => {
      if (block.id === collectionId) {
        const updatedInternalBlocks = [...(block.internalBlocks || [])];
        if (!updatedInternalBlocks.includes(blockId)) {
          updatedInternalBlocks.push(blockId);
        }
        return {
          ...block,
          internalBlocks: updatedInternalBlocks
        };
      }
      return block;
    }));

    // Обновляем позицию CollectionEnd
    setTimeout(() => {
      updateCollectionEndPosition(collectionId);
    }, 50);
  };

  // Удаление блока из Collection
  const removeBlockFromCollection = (blockId: string, collectionId: string) => {
    const collectionBlock = blocks.find(b => b.id === collectionId && b.type === 'Collection');
    if (!collectionBlock) return;

    // Обновляем список внутренних блоков для Collection
    setBlocks(prev => prev.map(block => {
      if (block.id === collectionId) {
        return {
          ...block,
          internalBlocks: (block.internalBlocks || []).filter(id => id !== blockId)
        };
      }
      return block;
    }));

    // Обновляем позицию CollectionEnd
    setTimeout(() => {
      updateCollectionEndPosition(collectionId);
    }, 50);
  };

  // Создание нового блока
  const addBlock = () => {
    const id = `block-${Date.now()}`;
    let title = getBlockTitle(selectedBlockType);
    const currentZIndex = getNextZIndex();

    // Если это Flow, создаем контейнер
    if (selectedBlockType === 'Flow') {
      title = `Flow${flowCounter}`;

      const newBlock: Block = {
        id,
        type: 'Flow',
        title,
        position: { x: 100, y: 100 },
        connections: {
          top: null,
          bottom: [],
        },
        children: [], // Пустой массив для дочерних блоков
        width: FLOW_MIN_WIDTH, // Ширина Flow-контейнера
        height: FLOW_MIN_HEIGHT, // Высота Flow-контейнера
        zIndex: currentZIndex,
      };

      setBlocks((prev) => [...prev, newBlock]);
      setFlowCounter(prev => prev + 1);
      return;
    }

    // Если это Collection, создаем пару блоков (Collection и CollectionEnd)
    if (selectedBlockType === 'Collection') {
      title = `Collection${collectionCounter}`;

      const collectionEndId = `collection-end-${Date.now()}`;
      const collectionEndBlock: Block = {
        id: collectionEndId,
        type: 'CollectionEnd',
        title: `CollectionEnd${collectionCounter}`, // Используем тот же номер для CollectionEnd
        position: { x: 100, y: 100 + COLLECTION_DEFAULT_GAP }, // Располагаем под блоком Collection на расстоянии 2-х блоков
        connections: {
          top: id, // Соединяем с блоком Collection
          bottom: [], // У CollectionEnd может быть нижний коннектор
        },
        pairedWithId: id, // ID связанного блока Collection
        zIndex: currentZIndex + 1, // CollectionEnd будет выше чем Collection
      };

      // Создаем блок Collection
      const newBlock: Block = {
        id,
        type: selectedBlockType,
        title: title,
        position: { x: 100, y: 100 },
        connections: {
          top: null,
          bottom: [collectionEndId], // Соединяем с CollectionEnd
        },
        pairedWithId: collectionEndId, // ID связанного блока CollectionEnd
        internalBlocks: [], // Список блоков внутри Collection
        zIndex: currentZIndex,
      };

      // Добавляем оба блока
      setBlocks((prev) => [...prev, newBlock, collectionEndBlock]);

      // Добавляем соединение между ними
      setConnections((prev) => [
        ...prev,
        {
          from: { id, point: 'bottom' },
          to: { id: collectionEndId, point: 'top' },
        }
      ]);

      // Увеличиваем счетчик Collection
      setCollectionCounter(prev => prev + 1);

      // Увеличиваем z-index ещё раз (для следующего блока)
      setNextZIndex(currentZIndex + 2);
      return;
    }

    // Если это Switch, добавляем номер
    if (selectedBlockType === 'Switch') {
      title = `Switch${switchCounter}`;

      const switchEndId = `switch-end-${Date.now()}`;
      const switchEndBlock: Block = {
        id: switchEndId,
        type: 'End',
        title: `SwitchEnd${switchCounter}`, // Используем тот же номер для SwitchEnd
        position: { x: 100, y: 200 }, // Располагаем под блоком Switch
        connections: {
          top: id, // Соединяем с блоком Switch
          bottom: [], // У Switch End может быть нижний коннектор
        },
        zIndex: currentZIndex + 1, // End будет выше чем Switch
      };

      // Создаем блок Switch
      const newBlock: Block = {
        id,
        type: selectedBlockType,
        title: title,
        position: { x: 100, y: 100 },
        connections: {
          top: null,
          bottom: [switchEndId], // Соединяем с SwitchEnd
        },
        zIndex: currentZIndex,
      };

      // Добавляем оба блока
      setBlocks((prev) => [...prev, newBlock, switchEndBlock]);

      // Добавляем соединение между ними
      setConnections((prev) => [
        ...prev,
        {
          from: { id, point: 'bottom' },
          to: { id: switchEndId, point: 'top' },
        }
      ]);

      // Увеличиваем счетчик Switch
      setSwitchCounter(prev => prev + 1);

      // Увеличиваем z-index ещё раз (для следующего блока)
      setNextZIndex(currentZIndex + 2);
    } else {
      // Для обычных блоков - стандартное создание
      const newBlock: Block = {
        id,
        type: selectedBlockType,
        title: title,
        position: { x: 100, y: 100 },
        connections: {
          top: null,
          bottom: [],
        },
        zIndex: currentZIndex,
      };

      // Добавляем только один блок
      setBlocks((prev) => [...prev, newBlock]);
    }
  };

  // Получение заголовка блока в зависимости от типа
  const getBlockTitle = (type: BlockType): string => {
    switch (type) {
      case 'Action':
        return 'Action';
      case 'Table':
        return 'Table';
      case 'Switch':
        return 'Switch';
      case 'Start':
        return 'Start';
      case 'End':
        return 'End';
      case 'Flow':
        return 'Flow';
      case 'Collection':
        return 'Collection';
      default:
        return 'Block';
    }
  };

  // Вычисление необходимого размера Flow контейнера
  const calculateFlowSize = (flowId: string) => {
    const childBlocks = blocks.filter(b => b.parentFlow === flowId);

    if (childBlocks.length === 0) {
      return { width: FLOW_MIN_WIDTH, height: FLOW_MIN_HEIGHT };
    }

    // Вычисляем требуемую высоту на основе количества блоков
    const totalBlocksHeight = childBlocks.length * BLOCK_HEIGHT;
    const totalSpacingHeight = (childBlocks.length - 1) * BLOCK_SPACING;
    const requiredHeight = Math.max(
        FLOW_MIN_HEIGHT,
        totalBlocksHeight + totalSpacingHeight + FLOW_PADDING * 2
    );

    // Ширина обычно фиксирована, но можно вычислить, если нужно
    const requiredWidth = FLOW_MIN_WIDTH;

    return { width: requiredWidth, height: requiredHeight };
  };

  // Обновление размера Flow при добавлении или удалении блоков
  const updateFlowSize = (flowId: string) => {
    const { width, height } = calculateFlowSize(flowId);

    setBlocks(blocks.map(block => {
      if (block.id === flowId) {
        return { ...block, width, height };
      }
      return block;
    }));
  };

  // Удаление блока
  const removeBlock = (id: string) => {
    const blockToRemove = blocks.find(b => b.id === id);
    if (!blockToRemove) return;

    // Если блок находится внутри Flow, удаляем его из родительского Flow
    if (blockToRemove.parentFlow) {
      const parentFlowId = blockToRemove.parentFlow;

      // Удаляем блок из родительского Flow
      setBlocks(blocks.map(block => {
        if (block.id === parentFlowId) {
          return {
            ...block,
            children: block.children?.filter(childId => childId !== id) || []
          };
        }
        return block;
      }));

      // После удаления блока, пересчитываем размер Flow и перераспределяем блоки
      setTimeout(() => {
        updateFlowSize(parentFlowId);
        organizeBlocksInFlow(parentFlowId);
      }, 0);
    }

    // Если блок находится внутри Collection, удаляем его из списка внутренних блоков Collection
    // и обновляем позицию CollectionEnd
    const parentCollection = blocks.find(b =>
        b.type === 'Collection' &&
        b.internalBlocks &&
        b.internalBlocks.includes(id)
    );

    if (parentCollection) {
      removeBlockFromCollection(id, parentCollection.id);
    }

    // Если это Flow, нужно сначала освободить все вложенные блоки
    if (blockToRemove.type === 'Flow' && blockToRemove.children && blockToRemove.children.length > 0) {
      // Обновляем позиции блоков, которые были внутри Flow
      setBlocks(
          blocks.map(block => {
            if (block.parentFlow === id) {
              // Рассчитываем новую абсолютную позицию
              return {
                ...block,
                parentFlow: null,
                position: {
                  x: blockToRemove.position.x + block.position.x,
                  y: blockToRemove.position.y + block.position.y
                }
              };
            }
            return block;
          })
      );
    }

    // Если это Collection, удаляем связанный CollectionEnd и все соединения
    if (blockToRemove.type === 'Collection' && blockToRemove.pairedWithId) {
      const collectionEndId = blockToRemove.pairedWithId;

      // Удаляем блоки Collection и CollectionEnd
      const idsToRemove = new Set([id, collectionEndId]);

      // Удаляем все соединения, связанные с этими блоками
      setConnections(connections.filter(conn =>
          !idsToRemove.has(conn.from.id) && !idsToRemove.has(conn.to.id)
      ));

      // Удаляем блоки
      setBlocks(blocks.filter(block => !idsToRemove.has(block.id)));

      return;
    }

    // Если это CollectionEnd, удаляем связанный Collection и все соединения
    if (blockToRemove.type === 'CollectionEnd' && blockToRemove.pairedWithId) {
      const collectionId = blockToRemove.pairedWithId;

      // Удаляем блоки Collection и CollectionEnd
      const idsToRemove = new Set([id, collectionId]);

      // Удаляем все соединения, связанные с этими блоками
      setConnections(connections.filter(conn =>
          !idsToRemove.has(conn.from.id) && !idsToRemove.has(conn.to.id)
      ));

      // Удаляем блоки
      setBlocks(blocks.filter(block => !idsToRemove.has(block.id)));

      return;
    }

    // Проверяем, является ли блок частью пары Switch/SwitchEnd
    if (blockToRemove.type === 'Switch') {
      // Ищем все связанные SwitchEnd
      const connectedEnds = blocks.filter(b =>
          b.title.startsWith('SwitchEnd') &&
          blockToRemove.connections.bottom.includes(b.id)
      );

      // Удаляем все связанные SwitchEnd
      const idsToRemove = new Set([id, ...connectedEnds.map(b => b.id)]);

      // Удаляем все соединения, связанные с этими блоками
      setConnections(connections.filter(conn =>
          !idsToRemove.has(conn.from.id) && !idsToRemove.has(conn.to.id)
      ));

      // Удаляем блоки
      setBlocks(blocks.filter(block => !idsToRemove.has(block.id)));
    }
    // Проверяем, является ли блок SwitchEnd
    else if (blockToRemove.title.startsWith('SwitchEnd')) {
      // Ищем связанный Switch
      const parentSwitch = blocks.find(b =>
          b.title.startsWith('Switch') &&
          b.connections.bottom.includes(blockToRemove.id)
      );

      if (parentSwitch) {
        // Удаляем пару Switch/SwitchEnd
        const idsToRemove = new Set([id, parentSwitch.id]);

        // Удаляем все соединения, связанные с этими блоками
        setConnections(connections.filter(conn =>
            !idsToRemove.has(conn.from.id) && !idsToRemove.has(conn.to.id)
        ));

        // Удаляем блоки
        setBlocks(blocks.filter(block => !idsToRemove.has(block.id)));
      } else {
        // Если не нашли связанный Switch, удаляем только SwitchEnd
        // Удаляем все соединения, связанные с этим блоком
        setConnections(connections.filter(conn =>
            conn.from.id !== id && conn.to.id !== id
        ));

        // Удаляем блок
        setBlocks(blocks.filter(block => block.id !== id));
      }
    }
    else {
      // Для обычных блоков просто удаляем соединения и сам блок

      // Очищаем соединение в блоках, чтобы при удалении потом можно было снова делать подключения
      setBlocks(blocks.map(block => {
        if (block.connections.top?.includes(id)) {
          block.connections.top = null;
        }else if (block.connections.bottom?.includes(id)) {
          block.connections.bottom = [];
        }
        return block;
      }))

      // Удаляем все соединения, связанные с этим блоком
      setConnections(connections.filter(conn =>
          conn.from.id !== id && conn.to.id !== id
      ));

      // Удаляем блок
      setBlocks(blocks.filter(block => block.id !== id));
    }
  };

// Получение абсолютной позиции блока (с учетом родительского Flow)
  const getAbsolutePosition = (block: Block) => {
    // Если блок не в Flow, его позиция уже абсолютная
    if (!block.parentFlow) {
      return block.position;
    }

    // Получаем родительский Flow
    const parentFlow = blocks.find(b => b.id === block.parentFlow);
    if (!parentFlow) {
      return block.position;
    }

    // Возвращаем абсолютную позицию
    return {
      x: parentFlow.position.x + block.position.x,
      y: parentFlow.position.y + block.position.y
    };
  };

// Исправленная версия функции начала перетаскивания
// Восстанавливаем функциональность соединения Switch и Collection
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    if (!canvasRef.current) return;

    const block = blocks.find(b => b.id === id);
    if (!block) return;

    // Сбрасываем подсветку Flow при начале перетаскивания
    setHoveredFlow(null);

    // Проверяем, есть ли активный процесс соединения от Switch
    if (connecting && connecting.blockId !== id && connecting.point === 'bottom') {
      const sourceBlock = blocks.find(b => b.id === connecting.blockId);

      if (sourceBlock && (sourceBlock.type === 'Switch' || sourceBlock.type === 'Collection') && block.type !== 'Start') {
        // Соединяем Switch или Collection с выбранным блоком
        // Проверяем, что у целевого блока нет соединения сверху
        if (block.connections.top === null) {
          // Целевой блок должен иметь z-index выше, чем родительский блок
          const newZIndex = Math.max(sourceBlock.zIndex + 1, block.zIndex);

          // Обновляем соединения в блоках
          setBlocks(blocks.map(b => {
            if (b.id === sourceBlock.id) {
              // Обновляем Source блок (Switch или Collection)
              return {
                ...b,
                connections: {
                  ...b.connections,
                  bottom: [...b.connections.bottom, block.id]
                }
              };
            } else if (b.id === block.id) {
              // Обновляем Target блок и увеличиваем его zIndex
              return {
                ...b,
                connections: {
                  ...b.connections,
                  top: sourceBlock.id
                },
                zIndex: newZIndex
              };
            }
            return b;
          }));

          // Добавляем соединение в список соединений
          setConnections([
            ...connections,
            {
              from: { id: sourceBlock.id, point: 'bottom' },
              to: { id: block.id, point: 'top' }
            }
          ]);

          // Если блок добавляется к Collection, проверяем, не находится ли он между Collection и CollectionEnd
          if (sourceBlock.type === 'Collection') {
            // Добавляем блок в список внутренних блоков Collection
            addBlockToCollection(block.id, sourceBlock.id);
          }

          // Воспроизводим звук подключения
          playConnectSound();
        }

        setConnecting(null);
        return;
      }
    }

    // Устанавливаем высокий z-index для перетаскиваемого блока
    setBlocks(blocks.map(b => {
      if (b.id === id) {
        return { ...b, zIndex: 1000 }; // Высокий z-index для активного блока
      }
      // Если это Flow, убедимся, что он имеет меньший z-index чем его дочерние блоки
      if (b.type === 'Flow' && block.parentFlow === b.id) {
        return { ...b, zIndex: 1 }; // Низкий z-index для родительского Flow
      }
      return b;
    }));

    const rect = canvasRef.current.getBoundingClientRect();

    // Получаем АБСОЛЮТНУЮ позицию блока для правильного вычисления смещения
    const absolutePosition = getAbsolutePosition(block);
    const offsetX = e.clientX - rect.left - absolutePosition.x;
    const offsetY = e.clientY - rect.top - absolutePosition.y;

    setDraggedBlock({ id, offsetX, offsetY });
  };

  // Получение всех блоков, подключенных ниже указанного блока
  // Исправленная версия для надежного получения всех связанных блоков
  const getConnectedBlocksBelow = (blockId: string, visited: Set<string> = new Set()): string[] => {
    if (visited.has(blockId)) return [];

    visited.add(blockId);
    const block = blocks.find(b => b.id === blockId);

    if (!block) return [];

    const connectedIds: string[] = [];

    // Если это Collection, добавляем CollectionEnd
    if (block.type === 'Collection' && block.pairedWithId) {
      connectedIds.push(block.pairedWithId);

      // Также добавляем все внутренние блоки
      if (block.internalBlocks) {
        connectedIds.push(...block.internalBlocks);
      }
    }

    // Получаем блоки, подключенные снизу
    for (const bottomId of block.connections.bottom) {
      // Проверяем, что соединение существует
      const bottomBlock = blocks.find(b => b.id === bottomId);
      if (!bottomBlock) continue;

      // Добавляем блок в список связанных
      connectedIds.push(bottomId);

      // Рекурсивный вызов для блоков ниже
      const childBlocks = getConnectedBlocksBelow(bottomId, visited);
      connectedIds.push(...childBlocks);
    }

    // Если это Flow, добавляем все его дочерние блоки
    if (block.type === 'Flow' && block.children) {
      for (const childId of block.children) {
        if (!visited.has(childId)) {
          // Добавляем блок в список связанных
          connectedIds.push(childId);

          // Рекурсивный вызов для дочерних блоков
          const grandChildren = getConnectedBlocksBelow(childId, visited);
          connectedIds.push(...grandChildren);
        }
      }
    }

    // Возвращаем все уникальные ID (на всякий случай используем Set)
    return [...new Set(connectedIds)];
  };

  // Проверка, находится ли блок над Flow - упрощенная версия
  const checkBlockOverFlow = (blockId: string, position: { x: number; y: number }) => {
    // Не проверяем для Flow блоков (Flow не может быть внутри Flow)
    const currentBlock = blocks.find(b => b.id === blockId);
    if (!currentBlock || currentBlock.type === 'Flow') return null;

    // Проверяем каждый Flow блок
    for (const flowBlock of blocks) {
      if (flowBlock.type !== 'Flow' || flowBlock.id === blockId) continue;

      // Простая проверка по координатам
      if (
          position.x >= flowBlock.position.x &&
          position.x <= flowBlock.position.x + (flowBlock.width || FLOW_MIN_WIDTH) &&
          position.y >= flowBlock.position.y &&
          position.y <= flowBlock.position.y + (flowBlock.height || FLOW_MIN_HEIGHT)
      ) {
        return flowBlock.id;
      }
    }

    return null;
  };

  // Упрощенная версия организации блоков внутри Flow
  // Сохраняет z-index блоков внутри Flow
  const organizeBlocksInFlow = (flowId: string) => {
    const flowBlock = blocks.find(b => b.id === flowId);
    if (!flowBlock || flowBlock.type !== 'Flow') return;

    const childBlocks = blocks.filter(b => b.parentFlow === flowId);
    if (childBlocks.length === 0) return;

    console.log(`Организуем ${childBlocks.length} блоков внутри Flow ${flowBlock.title}`);

    // Сортируем блоки по вертикальной позиции
    childBlocks.sort((a, b) => a.position.y - b.position.y);

    // Обновляем позиции всех блоков внутри Flow
    const updatedBlocks = blocks.map(block => {
      if (block.parentFlow === flowId) {
        const index = childBlocks.indexOf(block);

        // Сохраняем текущий z-index блока (если он выше 10)
        // или назначаем новый высокий z-index
        const zIndex = block.zIndex >= 100 ? block.zIndex : 100 + index;

        return {
          ...block,
          position: {
            x: FLOW_PADDING, // Фиксируем слева с отступом
            y: FLOW_PADDING + (index * (BLOCK_HEIGHT + BLOCK_SPACING)) // Располагаем вертикально с интервалами
          },
          zIndex: zIndex // Используем сохраненный или новый z-index
        };
      } else if (block.id === flowId) {
        // Устанавливаем z-index Flow всегда ниже блоков внутри него
        return {
          ...block,
          zIndex: 1
        };
      }
      return block;
    });

    console.log(`Обновляем позиции ${childBlocks.length} блоков в Flow ${flowBlock.title}`);
    setBlocks(updatedBlocks);

    // Обновляем размер Flow после упорядочивания блоков
    updateFlowSize(flowId);
  };

  // Перетаскивание - с поддержкой Collection (обновленная версия)
  const handleDrag = (e: MouseEvent) => {
    if (!draggedBlock || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const currentBlock = blocks.find(b => b.id === draggedBlock.id);
    if (!currentBlock) return;

    // Текущая позиция мыши относительно канваса
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Рассчитываем новую позицию блока
    const newX = mouseX - draggedBlock.offsetX;
    const newY = mouseY - draggedBlock.offsetY;

    // Проверяем, находится ли блок над Flow
    // Используем координаты центра блока для более точного определения
    const blockCenterX = newX + 100; // Половина ширины блока (200px)
    const blockCenterY = newY + 40;  // Половина высоты блока (80px)

    const flowId = checkBlockOverFlow(currentBlock.id, { x: blockCenterX, y: blockCenterY });

    // Обновляем состояние подсветки Flow
    setHoveredFlow(flowId);

    // Получаем предыдущую позицию для расчета смещения
    const oldPosition = getAbsolutePosition(currentBlock);

    // Смещение
    const deltaX = newX - oldPosition.x;
    const deltaY = newY - oldPosition.y;

    // Обновляем позицию блоков
    let updatedBlocks = [...blocks];

    // Если перетаскиваемый блок имеет соединение сверху, проверяем, не нужно ли его отсоединить
    const hasTopConnection = currentBlock.connections.top !== null;

    // Уменьшаем порог отсоединения для более чёткого разъединения блоков
    // Используем вертикальное расстояние для определения отсоединения
    const disconnectThreshold = 15; // Порог расстояния для отсоединения блока

    // Если блок имеет соединение сверху (и это не связка Switch-SwitchEnd или Collection-CollectionEnd)
    if (hasTopConnection) {
      const parentBlockId = currentBlock.connections.top;
      const parentBlock = updatedBlocks.find(b => b.id === parentBlockId);

      if (parentBlock) {
        // Проверяем, не является ли это пара Collection-CollectionEnd
        const isCollectionEndPair = parentBlock.type === 'Collection' && currentBlock.type === 'CollectionEnd';

        // Не отсоединяем SwitchEnd от его Switch или блоки от Switch, CollectionEnd от Collection
        const isSwitchEndPair = parentBlock.title.startsWith('Switch') && currentBlock.title.startsWith('SwitchEnd');
        const isConnectedToSwitch = parentBlock.type === 'Switch';
        const isConnectedToCollection = parentBlock.type === 'Collection';

        // Изменяем условие: не отсоединять если это Switch, Collection или пары
        if (!isSwitchEndPair && !isCollectionEndPair && !isConnectedToSwitch && !isConnectedToCollection) {
          // Получаем абсолютные позиции блоков
          const parentPos = getAbsolutePosition(parentBlock);
          const currentPos = { x: newX, y: newY };

          // Проверяем вертикальное расстояние между соединёнными блоками
          const parentBottom = parentPos.y + 80; // Нижняя точка родительского блока
          const childTop = currentPos.y; // Верхняя точка дочернего блока (новая позиция)
          const verticalDistance = Math.abs(parentBottom - childTop);

          // Также проверяем горизонтальное смещение
          const parentCenterX = parentPos.x + 100; // Центр родительского блока
          const childCenterX = currentPos.x + 100; // Центр дочернего блока (новая позиция)
          const horizontalDistance = Math.abs(parentCenterX - childCenterX);

          // Если расстояние превышает порог, отсоединяем блок
          if (verticalDistance > disconnectThreshold || horizontalDistance > 30) {
            // Удаляем соединение из родительского блока
            updatedBlocks = updatedBlocks.map(block => {
              if (block.id === parentBlockId) {
                return {
                  ...block,
                  connections: {
                    ...block.connections,
                    bottom: block.connections.bottom.filter(id => id !== currentBlock.id)
                  }
                };
              }
              return block;
            });

            // Удаляем соединение из текущего блока
            updatedBlocks = updatedBlocks.map(block => {
              if (block.id === currentBlock.id) {
                return {
                  ...block,
                  connections: {
                    ...block.connections,
                    top: null
                  }
                };
              }
              return block;
            });

            // Удаляем соединение из списка соединений
            setConnections(prevConnections =>
                prevConnections.filter(conn =>
                    !(conn.from.id === parentBlockId && conn.to.id === currentBlock.id) &&
                    !(conn.from.id === currentBlock.id && conn.to.id === parentBlockId)
                )
            );

            // Если блок был в Collection, удаляем его из внутренних блоков
            if (parentBlock.type === 'Collection') {
              removeBlockFromCollection(currentBlock.id, parentBlockId);
            }
          }
        }
      }
    }

    // Находим все коллекции и проверяем, находится ли блок между Collection и CollectionEnd
    if (currentBlock.type !== 'Collection' && currentBlock.type !== 'CollectionEnd') {
      const collections = blocks.filter(b => b.type === 'Collection');

      for (const collection of collections) {
        // Если блок между Collection и CollectionEnd, добавляем его в список внутренних блоков
        if (isBlockBetweenCollection(currentBlock.id, collection.id)) {
          if (!collection.internalBlocks?.includes(currentBlock.id)) {
            addBlockToCollection(currentBlock.id, collection.id);
          }
        } else {
          // Если блок НЕ между Collection и CollectionEnd, но был в списке внутренних блоков, удаляем его
          if (collection.internalBlocks?.includes(currentBlock.id)) {
            removeBlockFromCollection(currentBlock.id, collection.id);
          }
        }
      }
    }

    // Получаем список всех блоков, которые нужно сместить
    // Включая блоки внутри Flow, если перетаскивается Flow
    const connectedBlocks = getConnectedBlocksBelow(draggedBlock.id);

    // Если перетаскивается блок Collection или CollectionEnd
    const isCollectionBlock = currentBlock.type === 'Collection';
    const isCollectionEndBlock = currentBlock.type === 'CollectionEnd';

    // Получаем связанную пару (Collection или CollectionEnd)
    let pairedBlockId = null;
    if (isCollectionBlock) {
      pairedBlockId = currentBlock.pairedWithId;
    } else if (isCollectionEndBlock) {
      pairedBlockId = currentBlock.pairedWithId;
    }

    // Получаем все внутренние блоки Collection
    let collectionInternalBlocks: string[] = [];
    if (isCollectionBlock) {
      collectionInternalBlocks = currentBlock.internalBlocks || [];
    } else if (isCollectionEndBlock) {
      const pairedCollection = blocks.find(b => b.id === pairedBlockId);
      if (pairedCollection) {
        collectionInternalBlocks = pairedCollection.internalBlocks || [];
      }
    }

    // Обновляем позиции текущего и связанных блоков
    updatedBlocks = updatedBlocks.map(block => {
      if (block.id === draggedBlock.id) {
        // Если перетаскиваемый блок - Flow с дочерними блоками
        if (block.type === 'Flow' && block.children && block.children.length > 0) {
          // При перетаскивании Flow все дочерние блоки просто следуют за ним
          // их относительная позиция внутри Flow не меняется
          return { ...block, position: { x: newX, y: newY } };
        }

        // Если блок в Flow, позиция относительно Flow
        if (block.parentFlow) {
          const parentFlow = blocks.find(b => b.id === block.parentFlow);
          if (parentFlow) {
            // Если блок вытаскивается из Flow
            if (!flowId || flowId !== block.parentFlow) {
              // Важное исправление: обновляем массив children у родительского Flow
              // Также удаляем все связанные блоки из Flow
              const connectedIds = getConnectedBlocksBelow(block.id);
              updatedBlocks = updatedBlocks.map(b => {
                if (b.id === block.parentFlow) {
                  return {
                    ...b,
                    children: (b.children || []).filter(childId =>
                        childId !== block.id && !connectedIds.includes(childId)
                    )
                  };
                }
                return b;
              });

              // Извлекаем блок из Flow с абсолютной позицией
              const absolutePosition = getAbsolutePosition(block);
              return {
                ...block,
                parentFlow: null,
                position: { x: absolutePosition.x, y: absolutePosition.y }
              };
            }

            // Иначе обновляем позицию внутри Flow - оставляем только горизонтальную позицию фиксированной
            return {
              ...block,
              position: {
                x: FLOW_PADDING, // Фиксируем отступ слева
                y: Math.max(FLOW_PADDING, newY - parentFlow.position.y)
              }
            };
          }
        }

        // Обычный блок не в Flow или Flow блок
        return { ...block, position: { x: newX, y: newY } };
      }
      // Обработка парных блоков Collection
      else if (pairedBlockId && block.id === pairedBlockId) {
        if (isCollectionBlock) {
          // Если перетаскивается Collection, перемещаем CollectionEnd
          // по вертикали, сохраняя расстояние между ними
          return {
            ...block,
            position: {
              x: newX, // Та же X координата
              y: block.position.y + deltaY // Сохраняем вертикальное расстояние
            }
          };
        } else if (isCollectionEndBlock) {
          // Если перетаскивается CollectionEnd, перемещаем Collection
          // по горизонтали и по вертикали
          return {
            ...block,
            position: {
              x: newX,  // Та же X координата
              y: block.position.y + deltaY // Сохраняем вертикальное расстояние
            }
          };
        }
      }
      // Обработка блоков внутри Collection
      else if ((isCollectionBlock || isCollectionEndBlock) && collectionInternalBlocks.includes(block.id)) {
        // Перемещаем все внутренние блоки Collection вместе с ней
        return {
          ...block,
          position: {
            x: block.position.x + deltaX, // Перемещаем по X
            y: block.position.y + deltaY  // Перемещаем по Y
          }
        };
      }
      // Обработка обычных связанных блоков
      else if (connectedBlocks.includes(block.id)) {
        // Перемещаем все связанные блоки на то же смещение
        // Если это блок внутри Flow и Flow сам перетаскивается, то не меняем его внутреннюю позицию
        if (block.parentFlow && block.parentFlow === draggedBlock.id) {
          // Блок внутри перетаскиваемого Flow, оставляем относительную позицию
          return block;
        } else if (block.parentFlow) {
          // Если блок извлекается из Flow, обновляем его parentFlow на null
          const draggedBlockParentFlow =
              draggedBlock && blocks.find(b => b.id === draggedBlock.id)?.parentFlow;

          if (block.parentFlow === draggedBlockParentFlow &&
              (!flowId || flowId !== draggedBlockParentFlow)) {
            // Если связанный блок находится в том же Flow, из которого извлекается текущий блок,
            // то тоже извлекаем его (следует за главным блоком)
            const absolutePosition = getAbsolutePosition(block);
            return {
              ...block,
              parentFlow: null,
              position: {
                x: absolutePosition.x + deltaX,
                y: absolutePosition.y + deltaY
              }
            };
          }

          // Блок внутри другого Flow, обновляем его относительную позицию
          const parentFlow = blocks.find(b => b.id === block.parentFlow);
          if (parentFlow) {
            const blockPosition = getAbsolutePosition(block);
            return {
              ...block,
              position: {
                x: Math.max(FLOW_PADDING, blockPosition.x + deltaX - parentFlow.position.x),
                y: Math.max(FLOW_PADDING, blockPosition.y + deltaY - parentFlow.position.y)
              }
            };
          }
        }

        // Обычный блок, просто смещаем его
        const blockPosition = getAbsolutePosition(block);
        return {
          ...block,
          position: {
            x: blockPosition.x + deltaX,
            y: blockPosition.y + deltaY
          }
        };
      }
      return block;
    });

    setBlocks(updatedBlocks);

    // Если перетаскивается любой блок из Collection, обновляем позицию CollectionEnd
    if (isCollectionBlock) {
      setTimeout(() => {
        updateCollectionEndPosition(currentBlock.id);
      }, 0);
    } else if (isCollectionEndBlock && pairedBlockId) {
      setTimeout(() => {
        updateCollectionEndPosition(pairedBlockId);
      }, 0);
    }
  };

  // Конец перетаскивания
  const handleDragEnd = () => {
    if (!draggedBlock || !canvasRef.current) return;

    const currentBlock = blocks.find(b => b.id === draggedBlock.id);
    if (!currentBlock) {
      setDraggedBlock(null);
      return;
    }

    let updatedBlocks = [...blocks];
    const updatedConnections = [...connections];
    let connectionCreated = false;

    // Если перетаскивается Collection, обновляем позицию CollectionEnd
    if (currentBlock.type === 'Collection' && currentBlock.pairedWithId) {
      setTimeout(() => {
        updateCollectionEndPosition(currentBlock.id);
      }, 0);
    }

    // Если перетаскивается CollectionEnd, обновляем позицию соответствующего Collection
    if (currentBlock.type === 'CollectionEnd' && currentBlock.pairedWithId) {
      const collectionBlock = blocks.find(b => b.id === currentBlock.pairedWithId);
      if (collectionBlock) {
        setTimeout(() => {
          updateCollectionEndPosition(collectionBlock.id);
        }, 0);
      }
    }

    // Проверяем, нужно ли восстановить позицию блока относительно родителя
    // Это для случая, когда блок имеет соединение сверху и был перемещен несильно
    if (currentBlock.connections.top !== null) {
      const parentBlockId = currentBlock.connections.top;
      const parentBlock = blocks.find(b => b.id === parentBlockId);

      if (parentBlock) {
        // Не применяем к SwitchEnd, CollectionEnd или когда родитель - Switch/Collection
        const isSwitchEndPair = parentBlock.title.startsWith('Switch') && currentBlock.title.startsWith('SwitchEnd');
        const isCollectionEndPair = parentBlock.type === 'Collection' && currentBlock.type === 'CollectionEnd';
        const isParentSwitch = parentBlock.type === 'Switch';
        const isParentCollection = parentBlock.type === 'Collection';

        // Жесткую фиксацию применяем только для обычных блоков, не для соединений со Switch/Collection
        if (!isSwitchEndPair && !isCollectionEndPair && !isParentSwitch && !isParentCollection) {
          // Вычисляем правильную позицию для блока под родителем
          let newPositionX, newPositionY;

          // Если родитель в Flow, учитываем это
          if (parentBlock.parentFlow) {
            const parentFlow = blocks.find(b => b.id === parentBlock.parentFlow);
            if (parentFlow) {
              newPositionX = parentBlock.position.x;
              newPositionY = parentBlock.position.y + 83;
            } else {
              // Если Flow не найден, используем абсолютную позицию
              const parentPosition = getAbsolutePosition(parentBlock);
              newPositionX = parentPosition.x;
              newPositionY = parentPosition.y + 83;
            }
          } else {
            // Для обычных блоков
            const parentPosition = getAbsolutePosition(parentBlock);
            if (currentBlock.parentFlow) {
              // Если дочерний блок в Flow
              const childFlow = blocks.find(b => b.id === currentBlock.parentFlow);
              if (childFlow) {
                newPositionX = FLOW_PADDING;
                newPositionY = Math.max(FLOW_PADDING, parentPosition.y + 83 - childFlow.position.y);
              } else {
                newPositionX = parentPosition.x;
                newPositionY = parentPosition.y + 83;
              }
            } else {
              // Если оба блока не в Flow
              newPositionX = parentPosition.x;
              newPositionY = parentPosition.y + 83;
            }
          }

          // Перемещаем блок и все его дочерние блоки на правильную позицию
          const connectedBlocks = getConnectedBlocksBelow(currentBlock.id);
          const deltaX = newPositionX - currentBlock.position.x;
          const deltaY = newPositionY - currentBlock.position.y;

          updatedBlocks = updatedBlocks.map(block => {
            if (block.id === currentBlock.id) {
              return {
                ...block,
                position: { x: newPositionX, y: newPositionY }
              };
            } else if (connectedBlocks.includes(block.id)) {
              // Аналогично как в handleDrag, учитываем случаи блоков внутри Flow
              if (block.parentFlow && block.parentFlow === currentBlock.id) {
                // Блок внутри перетаскиваемого Flow, оставляем относительную позицию
                return block;
              } else if (block.parentFlow) {
                // Блок внутри другого Flow, обновляем его относительную позицию
                const parentFlow = blocks.find(b => b.id === block.parentFlow);
                if (parentFlow) {
                  return {
                    ...block,
                    position: {
                      x: Math.max(FLOW_PADDING, block.position.x + deltaX),
                      y: Math.max(FLOW_PADDING, block.position.y + deltaY)
                    }
                  };
                }
              }

              // Обычный блок
              return {
                ...block,
                position: {
                  x: block.position.x + deltaX,
                  y: block.position.y + deltaY
                }
              };
            }
            return block;
          });

          // Сбрасываем draggedBlock и обновляем блоки
          setDraggedBlock(null);
          setBlocks(updatedBlocks);

          // Если блок внутри Collection, обновляем позицию CollectionEnd
          const parentCollection = blocks.find(b =>
              b.type === 'Collection' &&
              b.internalBlocks &&
              b.internalBlocks.includes(currentBlock.id)
          );

          if (parentCollection) {
            setTimeout(() => {
              updateCollectionEndPosition(parentCollection.id);
            }, 0);
          }

          return;
        }
      }
    }

    // Полностью переписанная версия добавления блока в Flow
// С гарантированным перетаскиванием всех связанных блоков
    if (hoveredFlow && currentBlock.type !== 'Flow') {
      const flowBlock = blocks.find(b => b.id === hoveredFlow);
      if (flowBlock) {
        // Получаем все связанные блоки (те, что ниже текущего)
        const connectedBlocks = getConnectedBlocksBelow(currentBlock.id);
        console.log(`Добавляем блок ${currentBlock.title} и ${connectedBlocks.length} связанных блоков в Flow ${flowBlock.title}`);

        // Сначала установим очень низкий z-index для Flow
        updatedBlocks = updatedBlocks.map(block => {
          if (block.id === hoveredFlow) {
            return {...block, zIndex: 1}; // Flow всегда самый нижний
          }
          return block;
        });

        // Затем обновляем все блоки
        updatedBlocks = updatedBlocks.map(block => {
          // Обрабатываем основной блок
          if (block.id === currentBlock.id) {
            return {
              ...block,
              parentFlow: hoveredFlow,    // Устанавливаем родительский Flow
              position: {                 // Задаем начальную позицию внутри Flow
                x: FLOW_PADDING,
                y: FLOW_PADDING
              },
              zIndex: 100                 // Задаем высокий z-index для блоков в Flow
            };
          }

          // Обрабатываем все связанные блоки
          if (connectedBlocks.includes(block.id)) {
            // Вычисляем позицию относительно основного блока
            const baseAbsPos = getAbsolutePosition(currentBlock);
            const blockPos = getAbsolutePosition(block);

            // Вычисляем относительное смещение
            const relX = Math.max(FLOW_PADDING, blockPos.x - baseAbsPos.x + FLOW_PADDING);
            const relY = Math.max(FLOW_PADDING, blockPos.y - baseAbsPos.y + FLOW_PADDING);

            return {
              ...block,
              parentFlow: hoveredFlow,   // Перемещаем в Flow
              position: {
                x: relX,
                y: relY
              },
              zIndex: 101 + connectedBlocks.indexOf(block.id) // Увеличиваем z-index для каждого блока
            };
          }

          // Обрабатываем сам Flow
          if (block.id === hoveredFlow) {
            // Получаем все блоки для добавления (основной + связанные)
            const allBlocksToAdd = [currentBlock.id, ...connectedBlocks];

            // Обновляем список дочерних блоков
            const newChildren = [...(block.children || [])];

            // Добавляем все новые блоки в children
            for (const blockId of allBlocksToAdd) {
              if (!newChildren.includes(blockId)) {
                newChildren.push(blockId);
              }
            }

            return {
              ...block,
              children: newChildren,
              zIndex: 1  // Flow должен быть ниже всех блоков
            };
          }

          return block;
        });

        // Воспроизводим звук
        playConnectSound();

        // Организуем блоки в Flow с более длительной задержкой
        setTimeout(() => {
          organizeBlocksInFlow(hoveredFlow);
        }, 100);

        // Сбрасываем состояния
        setHoveredFlow(null);
        setDraggedBlock(null);

        // Применяем изменения
        setBlocks(updatedBlocks);
        return;
      }
    }

    // Если блок не был добавлен в Flow, проверяем возможность соединения с другими блоками
    if (!connecting && !currentBlock.title.startsWith('SwitchEnd') && !currentBlock.type.startsWith('CollectionEnd')) {
      const absolutePosition = getAbsolutePosition(currentBlock);
      const currentX = absolutePosition.x;
      const currentY = absolutePosition.y;
      const currentCenterX = currentX + 100; // Центр блока по X (учитываем ширину 200px)

      // 1. Проверяем верхний коннектор текущего блока (подключение снизу вверх)
      if (currentBlock.type !== 'Start' && currentBlock.connections.top === null) {
        // Позиция верхнего коннектора текущего блока
        const currentTopY = currentY;

        for (const targetBlock of blocks) {
          // Пропускаем себя и блоки End без нижнего коннектора
          if (targetBlock.id === currentBlock.id ||
              (targetBlock.type === 'End' && !targetBlock.title.startsWith('SwitchEnd'))) continue;

          // Пропускаем блоки, у которых уже есть соединение снизу (кроме Switch и Collection)
          if (targetBlock.type !== 'Switch' && targetBlock.type !== 'Collection' && targetBlock.connections.bottom.length > 0) continue;

          // Получаем абсолютную позицию целевого блока
          const targetPosition = getAbsolutePosition(targetBlock);

          // Позиция нижнего коннектора целевого блока
          const targetBottomY = targetPosition.y + 80;
          const targetCenterX = targetPosition.x + 100; // Центр блока (учитываем ширину 200px)

          // Проверка на близость коннекторов - увеличиваем область для лучшего притяжения
          const verticalDistance = Math.abs(currentTopY - targetBottomY);
          const horizontalDistance = Math.abs(currentCenterX - targetCenterX);

          // Увеличиваем расстояние снэпа для лучшего притяжения
          if (verticalDistance < 30 && horizontalDistance < 40) {
            // Сначала обновляем текущий блок и его связь
            // Если блок находится в Flow, позиционируем его относительно Flow
            let newPositionX, newPositionY;

            if (currentBlock.parentFlow) {
              const parentFlow = blocks.find(b => b.id === currentBlock.parentFlow);
              if (parentFlow) {
                // В Flow используем относительную позицию
                const relativeY = targetPosition.y + 83 - parentFlow.position.y;
                newPositionX = FLOW_PADDING; // Фиксированный отступ слева в Flow
                newPositionY = Math.max(FLOW_PADDING, relativeY);
              } else {
                // Если Flow не найден, используем абсолютную позицию
                newPositionX = targetPosition.x;
                newPositionY = targetPosition.y + 83;
              }
            } else {
              // Для обычных блоков используем абсолютную позицию
              newPositionX = targetPosition.x;
              newPositionY = targetPosition.y + 83;
            }

            // Устанавливаем z-index для текущего блока выше, чем у родительского
            const newZIndex = Math.max(targetBlock.zIndex + 1, currentBlock.zIndex);

            // Получаем все блоки, подключенные снизу текущего
            const connectedBlocks = getConnectedBlocksBelow(currentBlock.id);
            const deltaY = newPositionY - currentBlock.position.y;
            const deltaX = newPositionX - currentBlock.position.x;

            // Обновляем все блоки: текущий и все связанные снизу
            updatedBlocks = updatedBlocks.map(block => {
              if (block.id === currentBlock.id) {
                // Обновляем текущий блок
                return {
                  ...block,
                  position: { x: newPositionX, y: newPositionY },
                  connections: {
                    ...block.connections,
                    top: targetBlock.id
                  },
                  zIndex: newZIndex
                };
              } else if (connectedBlocks.includes(block.id)) {
                // Обновляем все связанные блоки снизу на то же смещение
                // Аналогично как в handleDrag, учитываем случаи блоков внутри Flow
                if (block.parentFlow && block.parentFlow === currentBlock.id) {
                  // Блок внутри перетаскиваемого Flow, оставляем относительную позицию
                  return block;
                } else if (block.parentFlow) {
                  // Блок внутри другого Flow, обновляем его относительную позицию
                  const parentFlow = blocks.find(b => b.id === block.parentFlow);
                  if (parentFlow) {
                    return {
                      ...block,
                      position: {
                        x: Math.max(FLOW_PADDING, block.position.x + deltaX),
                        y: Math.max(FLOW_PADDING, block.position.y + deltaY)
                      },
                      zIndex: newZIndex + 1 + connectedBlocks.indexOf(block.id)
                    };
                  }
                }

                // Обычный блок
                return {
                  ...block,
                  position: {
                    x: block.position.x + deltaX,
                    y: block.position.y + deltaY
                  },
                  zIndex: newZIndex + 1 + connectedBlocks.indexOf(block.id)
                };
              } else if (block.id === targetBlock.id) {
                // Обновляем целевой блок (верхний)
                return {
                  ...block,
                  connections: {
                    ...block.connections,
                    bottom: [...block.connections.bottom, currentBlock.id]
                  }
                };
              }
              return block;
            });

            // Добавляем соединение
            updatedConnections.push({
              from: { id: targetBlock.id, point: 'bottom' },
              to: { id: currentBlock.id, point: 'top' }
            });

            connectionCreated = true;

            // Если целевой блок - Collection, сразу обновляем его состояние
            if (targetBlock.type === 'Collection') {
              setTimeout(() => {
                updateCollectionEndPosition(targetBlock.id);
              }, 50);
            }

            // Воспроизводим звук подключения
            playConnectSound();

            break;
          }
        }
      }

      // 2. Проверяем нижний коннектор текущего блока (подключение сверху вниз)
      if (!connectionCreated && currentBlock.type !== 'End') {
        // Позиция нижнего коннектора текущего блока
        const currentBottomY = currentY + 80;

        for (const targetBlock of blocks) {
          // Пропускаем себя и блоки Start
          if (targetBlock.id === currentBlock.id || targetBlock.type === 'Start') continue;

          // Пропускаем блоки, которые уже имеют соединение сверху
          if (targetBlock.connections.top !== null) continue;

          // Проверяем, есть ли у текущего блока уже соединение снизу (кроме Switch и Collection)
          if (currentBlock.type !== 'Switch' && currentBlock.type !== 'Collection' && currentBlock.connections.bottom.length > 0) continue;

          // Получаем абсолютную позицию целевого блока
          const targetPosition = getAbsolutePosition(targetBlock);

          // Позиция верхнего коннектора целевого блока
          const targetTopY = targetPosition.y;
          const targetCenterX = targetPosition.x + 100; // Центр блока (учитываем ширину 200px)

          // Проверка на близость коннекторов - увеличиваем область для лучшего притяжения
          const verticalDistance = Math.abs(currentBottomY - targetTopY);
          const horizontalDistance = Math.abs(currentCenterX - targetCenterX);

          // Увеличиваем расстояние снэпа для лучшего притяжения
          if (verticalDistance < 30 && horizontalDistance < 40) {
            // Расчет новой позиции для целевого блока с учетом Flow контейнеров
            let newTargetX, newTargetY;

            if (targetBlock.parentFlow) {
              const parentFlow = blocks.find(b => b.id === targetBlock.parentFlow);
              if (parentFlow) {
                const relativeY = currentY + 83 - parentFlow.position.y;
                newTargetX = FLOW_PADDING; // Фиксированный отступ слева в Flow
                newTargetY = Math.max(FLOW_PADDING, relativeY);
              } else {
                newTargetX = currentX;
                newTargetY = currentY + 83;
              }
            } else {
              newTargetX = currentX;
              newTargetY = currentY + 83;
            }

            // Устанавливаем z-index для целевого блока выше, чем у текущего
            const newZIndex = Math.max(currentBlock.zIndex + 1, targetBlock.zIndex);

            // Получаем все блоки, подключенные снизу целевого
            const connectedBlocks = getConnectedBlocksBelow(targetBlock.id);
            const deltaY = newTargetY - targetBlock.position.y;
            const deltaX = newTargetX - targetBlock.position.x;

            // Обновляем все блоки: целевой и связанные с ним
            updatedBlocks = updatedBlocks.map(block => {
              if (block.id === targetBlock.id) {
                // Обновляем целевой блок
                return {
                  ...block,
                  position: { x: newTargetX, y: newTargetY },
                  connections: {
                    ...block.connections,
                    top: currentBlock.id
                  },
                  zIndex: newZIndex
                };
              } else if (connectedBlocks.includes(block.id)) {
                // Аналогично как в предыдущем случае, учитываем Flow
                if (block.parentFlow && block.parentFlow === targetBlock.id) {
                  // Блок внутри перетаскиваемого Flow, оставляем относительную позицию
                  return block;
                } else if (block.parentFlow) {
                  // Блок внутри другого Flow, обновляем его относительную позицию
                  const parentFlow = blocks.find(b => b.id === block.parentFlow);
                  if (parentFlow) {
                    return {
                      ...block,
                      position: {
                        x: Math.max(FLOW_PADDING, block.position.x + deltaX),
                        y: Math.max(FLOW_PADDING, block.position.y + deltaY)
                      },
                      zIndex: newZIndex + 1 + connectedBlocks.indexOf(block.id)
                    };
                  }
                }

                // Обычный блок
                return {
                  ...block,
                  position: {
                    x: block.position.x + deltaX,
                    y: block.position.y + deltaY
                  },
                  zIndex: newZIndex + 1 + connectedBlocks.indexOf(block.id)
                };
              } else if (block.id === currentBlock.id) {
                // Обновляем текущий блок (верхний)
                return {
                  ...block,
                  connections: {
                    ...block.connections,
                    bottom: [...block.connections.bottom, targetBlock.id]
                  }
                };
              }
              return block;
            });

            // Добавляем соединение
            updatedConnections.push({
              from: { id: currentBlock.id, point: 'bottom' },
              to: { id: targetBlock.id, point: 'top' }
            });

            connectionCreated = true;

            // Если текущий блок - Collection, сразу обновляем его состояние
            if (currentBlock.type === 'Collection') {
              setTimeout(() => {
                updateCollectionEndPosition(currentBlock.id);
              }, 50);
            }

            // Воспроизводим звук подключения
            playConnectSound();

            break;
          }
        }
      }
    }

    // Восстанавливаем нормальный z-index для перетаскиваемого блока, если не было создано соединение
    if (!connectionCreated) {
      updatedBlocks = updatedBlocks.map(block => {
        if (block.id === currentBlock.id && block.zIndex === 1000) {
          // Восстанавливаем предыдущий z-index или устанавливаем новый высокий,
          // но не такой высокий как при перетаскивании
          const prevZIndex = getNextZIndex();
          return { ...block, zIndex: prevZIndex };
        }
        return block;
      });
    }

    // Если блок находится внутри Flow, организуем все блоки в Flow и обновляем размер Flow
    if (currentBlock.parentFlow) {
      setTimeout(() => {
        organizeBlocksInFlow(currentBlock.parentFlow);
        updateFlowSize(currentBlock.parentFlow);
      }, 0);
    }

    // Если блок является Flow, обновляем его размер
    if (currentBlock.type === 'Flow') {
      setTimeout(() => updateFlowSize(currentBlock.id), 0);
    }

    // Если блок находится внутри Collection, обновляем позицию CollectionEnd
    const parentCollection = blocks.find(b =>
        b.type === 'Collection' &&
        b.connections.bottom.some(id => id === currentBlock.id)
    );

    if (parentCollection) {
      setTimeout(() => {
        updateCollectionEndPosition(parentCollection.id);
      }, 50);
    }

    setBlocks(updatedBlocks);
    setConnections(updatedConnections);
    setDraggedBlock(null);
    setHoveredFlow(null);
  };

  // Начало соединения - восстановленная версия
  const handleConnectorClick = (blockId: string, point: 'top' | 'bottom') => {
    console.log(`Клик по коннектору блока ${blockId}, точка ${point}`);

    // Разрешаем соединение для Switch и Collection и Flow
    const block = blocks.find(b => b.id === blockId);
    if (!block || (block.type !== 'Switch' && block.type !== 'Collection' && block.type !== 'Flow')) return;

    if (connecting) {
      // Если мы уже начали соединение, завершаем его
      if (connecting.blockId === blockId) {
        // Мы выбрали тот же блок, отменяем выбор
        setConnecting(null);
        return;
      }

      // Проверяем, если у нас уже выбран коннектор блока, и мы кликаем по другому блоку
      const targetBlock = blocks.find(b => b.id === blockId);
      const sourceBlock = blocks.find(b => b.id === connecting.blockId);

      if (sourceBlock && connecting.point === 'bottom' && targetBlock) {
        // Соединяем блок с выбранным блоком
        // Для соединения должно идти от нижнего коннектора к верхнему коннектору целевого блока
        console.log(`Попытка соединить ${sourceBlock.title} с ${targetBlock.title}`);

        // Проверяем, что у целевого блока нет соединения сверху
        if (targetBlock.connections.top === null) {
          // Устанавливаем z-index целевого блока выше, чем у исходного
          const newZIndex = Math.max(sourceBlock.zIndex + 1, targetBlock.zIndex);

          // Обновляем соединения в блоках
          setBlocks(blocks.map(block => {
            if (block.id === sourceBlock.id) {
              // Обновляем Source блок
              return {
                ...block,
                connections: {
                  ...block.connections,
                  bottom: [...block.connections.bottom, targetBlock.id]
                }
              };
            } else if (block.id === targetBlock.id) {
              // Обновляем Target блок и его z-index
              return {
                ...block,
                connections: {
                  ...block.connections,
                  top: sourceBlock.id
                },
                zIndex: newZIndex
              };
            }
            return block;
          }));

          // Добавляем соединение в список соединений
          setConnections([
            ...connections,
            {
              from: { id: sourceBlock.id, point: 'bottom' },
              to: { id: targetBlock.id, point: 'top' }
            }
          ]);

          // Если исходный блок - Collection, добавляем целевой блок в список внутренних блоков
          if (sourceBlock.type === 'Collection') {
            addBlockToCollection(targetBlock.id, sourceBlock.id);
          }

          // Воспроизводим звук подключения
          playConnectSound();
          console.log(`Соединение создано между ${sourceBlock.title} и ${targetBlock.title}`);
        } else {
          console.log(`Блок ${targetBlock.title} уже имеет соединение сверху`);
        }

        setConnecting(null);
      }
    } else {
      // Начинаем новое соединение с блоком
      if (point === 'bottom') {
        console.log(`Начинаем соединение от блока ${block.title}`);
        setConnecting({ blockId, point });
      }
    }
  };

  // Удаление соединения по нажатию на крестик
  const handleRemoveConnection = (connectionIndex: number) => {
    const connection = connections[connectionIndex];
    if (!connection) return;

    // Получаем блоки, связанные с этим соединением
    const fromBlock = blocks.find(b => b.id === connection.from.id);
    const toBlock = blocks.find(b => b.id === connection.to.id);

    if (!fromBlock || !toBlock) return;

    // Обновляем связи в блоках
    const updatedBlocks = blocks.map(block => {
      if (block.id === fromBlock.id) {
        // Удаляем связь из исходного блока
        return {
          ...block,
          connections: {
            ...block.connections,
            bottom: block.connections.bottom.filter(id => id !== toBlock.id)
          }
        };
      } else if (block.id === toBlock.id) {
        // Удаляем связь из целевого блока
        return {
          ...block,
          connections: {
            ...block.connections,
            top: null
          }
        };
      }
      return block;
    });

    // Если fromBlock - Collection, обновляем его через updateCollectionEndPosition
    if (fromBlock.type === 'Collection') {
      // Удаляем соединение из списка соединений
      const updatedConnections = connections.filter((_, index) => index !== connectionIndex);
      setBlocks(updatedBlocks);
      setConnections(updatedConnections);

      // Обновляем позицию CollectionEnd и списки внутренних блоков
      setTimeout(() => {
        updateCollectionEndPosition(fromBlock.id);
      }, 50);
    } else {
      // Удаляем соединение из списка соединений
      const updatedConnections = connections.filter((_, index) => index !== connectionIndex);
      setBlocks(updatedBlocks);
      setConnections(updatedConnections);
    }
  };

  // Добавляем обработчики событий
  useEffect(() => {
    if (draggedBlock) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);

      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggedBlock, blocks]);

  // Расчет координат для отрисовки линий соединений
  const getConnectorCoordinates = (block: Block, point: 'top' | 'bottom') => {
    const absolutePosition = getAbsolutePosition(block);

    // Определяем высоту блока в зависимости от его типа
    const blockHeight = (block.type === 'Collection' || block.type === 'CollectionEnd')
        ? COLLECTION_BLOCK_HEIGHT
        : BLOCK_HEIGHT;

    // Учитываем тип блока для определения координат
    let x, y;

    if (block.type === 'Flow') {
      // Для Flow коннекторы располагаются по центру блока
      x = absolutePosition.x + (block.width || FLOW_MIN_WIDTH) / 2;
      y = point === 'top'
          ? absolutePosition.y
          : absolutePosition.y + (block.height || FLOW_MIN_HEIGHT);
    } else {
      // Для обычных блоков
      x = absolutePosition.x + 100; // середина блока по горизонтали
      y = point === 'top'
          ? absolutePosition.y
          : absolutePosition.y + blockHeight; // верх или низ блока
    }

    return { x, y };
  };

  // Отрисовка соединений между блоками
  const renderConnections = () => {
    return connections.map((conn, index) => {
      const fromBlock = blocks.find(b => b.id === conn.from.id);
      const toBlock = blocks.find(b => b.id === conn.to.id);

      if (!fromBlock || !toBlock) return null;

      // Не отображаем соединение между Switch и SwitchEnd
      if (fromBlock.type === 'Switch' && toBlock.title.startsWith('SwitchEnd') &&
          fromBlock.title.slice(6) === toBlock.title.slice(9)) {
        return null;
      }

      // Не отображаем соединение между Collection и CollectionEnd
      if (fromBlock.type === 'Collection' && toBlock.type === 'CollectionEnd' &&
          fromBlock.pairedWithId === toBlock.id) {
        return null;
      }

      // Не отображаем соединения для блоков внутри Collection
      const isToBlockInCollection = blocks.some(b =>
          b.type === 'Collection' &&
          b.internalBlocks &&
          b.internalBlocks.includes(toBlock.id)
      );

      if (isToBlockInCollection && fromBlock.type === 'Collection') {
        return null;
      }

      // Показываем соединения только от блоков Switch (не от Collection)
      if (fromBlock.type !== 'Switch') {
        return null;
      }

      const fromCoord = getConnectorCoordinates(fromBlock, conn.from.point);
      const toCoord = getConnectorCoordinates(toBlock, conn.to.point);

      // Вычисляем середину для создания плавной кривой
      const midY = (fromCoord.y + toCoord.y) / 2;
      const midX = (fromCoord.x + toCoord.x) / 2;

      const pathData = `
        M ${fromCoord.x} ${fromCoord.y}
        C ${fromCoord.x} ${midY}, ${toCoord.x} ${midY}, ${toCoord.x} ${toCoord.y}
      `;

      return (
          <g key={`conn-${index}`}>
            <path
                d={pathData}
                stroke="#333"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
            />

            {/* Крестик для удаления соединения только для Switch */}
            <foreignObject
                x={midX - 10}
                y={midY - 10}
                width="20"
                height="20"
                className="pointer-events-auto"
            >
              <div
                  className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center cursor-pointer"
                  onClick={() => handleRemoveConnection(index)}
              >
                <X size={12} className="text-white" />
              </div>
            </foreignObject>
          </g>
      );
    });
  };

  // Цвет блока в зависимости от типа
  const getBlockColor = (type: BlockType) => {
    switch (type) {
      case 'Action':
        return 'bg-cyan-100 border-cyan-200';
      case 'Table':
        return 'bg-green-100 border-green-200';
      case 'Switch':
        return 'bg-yellow-100 border-yellow-200';
      case 'Start':
        return 'bg-purple-100 border-purple-200';
      case 'SwitchEnd':
        return 'bg-yellow-100 border-yellow-200';
      case 'End':
        return 'bg-red-100 border-red-200';
      case 'Flow':
        return 'bg-blue-50 border-blue-200';
      case 'Collection':
        return 'bg-pink-100 border-pink-200';
      case 'CollectionEnd':
        return 'bg-pink-100 border-pink-200';
      default:
        return 'bg-gray-100 border-gray-200';
    }
  };

  return (
      <div className="flex flex-col h-screen bg-gray-100">
        {/* Добавляем стиль для гарантии z-index */}
        <style>
          {`
            /* Гарантируем, что Flow всегда под блоками */
            [data-block-type="Flow"] {
              z-index: 1 !important;
            }
            
            /* Гарантируем, что блоки внутри Flow всегда над Flow */
            [data-in-flow="true"] {
              z-index: 100 !important;
            }
            
            /* При перетаскивании блока, он должен быть выше всех */
            [data-dragging="true"] {
              z-index: 1000 !important;
            }
            
            /* Стили для Collection и BlockCollection */
            [data-block-type="Collection"], [data-block-type="CollectionEnd"] {
              border-left: 4px solid rgba(219, 39, 119, 0.7) !important;
            }
            
            /* Визуальное отображение связи между Collection и CollectionEnd */
            [data-collection-pair="true"] {
              box-shadow: 0 0 0 2px rgba(219, 39, 119, 0.3) !important;
            }
          `}
        </style>

        {/* Скрытый аудио-элемент (если нужен дополнительный контроль) */}
        <audio id="connect-sound" src="/sounds/connect-sound.mp3" preload="auto" style={{ display: 'none' }} />

        <div className="p-4 bg-white shadow-md">
          <div className="flex items-center space-x-4">
            <span className="font-bold text-lg">Select block type:</span>
            <select
                className="border p-2 rounded"
                value={selectedBlockType}
                onChange={(e) => setSelectedBlockType(e.target.value as BlockType)}
            >
              <option value="Action">Action</option>
              <option value="Table">Table</option>
              <option value="Switch">Switch</option>
              <option value="Start">Start</option>
              <option value="End">End</option>
              <option value="Flow">Flow</option>
              <option value="Collection">Collection</option>
            </select>
            <button
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                onClick={addBlock}
            >
              Add Block
            </button>
            <button
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
                onClick={() => setShowHints(!showHints)}
            >
              {showHints ? 'Hide Hints' : 'Show Hints'}
            </button>
          </div>
          {showHints && (
              <div className="mt-2 text-sm text-gray-600">
                <p>• Drag and <strong>release</strong> blocks near each other to connect them</p>
                <p>• You can connect blocks both ways (top-to-bottom or bottom-to-top)</p>
                <p>• Each Switch has a paired SwitchEnd that moves together with it</p>
                <p>• Each Collection has a paired CollectionEnd that moves together with it</p>
                <p>• When you add blocks to Collection, the CollectionEnd block will move down automatically</p>
                <p>• For Switch and Collection blocks: click on the <strong>bottom connector</strong> (it will turn blue), then click on <strong>any block</strong> you want to connect</p>
                <p>• Click on the <strong>red X button</strong> on a connection line to remove it</p>
                <p>• Sound feedback is provided when connecting blocks</p>
                <p>• <strong>Flow</strong> blocks can contain other blocks - drag a block over a Flow to add it inside</p>
                <p>• <strong>Flow</strong> blocks can be connected to other blocks via their top and bottom connectors</p>
              </div>
          )}
        </div>

        <div className="flex-1 relative overflow-auto" ref={canvasRef} style={{
          backgroundImage: 'radial-gradient(circle, #d1d1d1 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}>
          <svg className="absolute w-full h-full pointer-events-none">
            <defs>
              <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
              </marker>
            </defs>
            {renderConnections()}
          </svg>

          {/* Вертикальные линии соединения для Collection и CollectionEnd */}
          <svg className="absolute w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            {blocks.map(block => {
              if (block.type === 'Collection' && block.pairedWithId) {
                const collectionEndBlock = blocks.find(b => b.id === block.pairedWithId);
                if (!collectionEndBlock) return null;

                const startPos = getAbsolutePosition(block);
                const endPos = getAbsolutePosition(collectionEndBlock);

                // Рисуем только вертикальную линию между Collection и CollectionEnd
                // (горизонтальные линии к подключённым блокам убраны)
                return (
                    <line
                        key={`collection-line-${block.id}`}
                        x1={startPos.x + 10} // Немного смещаем от левого края
                        y1={startPos.y + 40} // Используем половинную высоту блока (40px)
                        x2={endPos.x + 10}
                        y2={endPos.y}
                        stroke="rgba(219, 39, 119, 0.5)" // Розовый цвет для Collection
                        strokeWidth="2"
                        strokeDasharray="4,4" // Пунктирная линия
                    />
                );
              }
              return null;
            })}
          </svg>

          {blocks.map((block) => {
            const isFlow = block.type === 'Flow';
            const isCollection = block.type === 'Collection';
            const isCollectionEnd = block.type === 'CollectionEnd';
            const absolutePosition = getAbsolutePosition(block);

            // Определяем, находится ли блок внутри Collection
            const inCollection = blocks.some(b =>
                b.type === 'Collection' &&
                b.internalBlocks &&
                b.internalBlocks.includes(block.id)
            );

            return (
                <div
                    key={block.id}
                    data-block-type={block.type}
                    data-in-flow={block.parentFlow ? "true" : "false"}
                    data-in-collection={inCollection ? "true" : "false"}
                    data-collection-pair={isCollection || isCollectionEnd ? "true" : "false"}
                    data-dragging={draggedBlock?.id === block.id ? "true" : "false"}
                    className={`absolute cursor-move ${isFlow ? 'border-2 border-dashed' : ''} 
                              ${hoveredFlow === block.id ? 'border-blue-500 bg-blue-100' : ''}
                              ${block.parentFlow ? 'shadow-md border-l-4 border-l-blue-500' : ''}`}
                    style={{
                      left: `${absolutePosition.x}px`,
                      top: `${absolutePosition.y}px`,
                      width: isFlow ? `${block.width || FLOW_MIN_WIDTH}px` : '200px',
                      height: isFlow ? `${block.height || FLOW_MIN_HEIGHT}px` : ((isCollection || isCollectionEnd) ? '40px' : '80px'),
                      zIndex: block.type === 'Flow' ? 1 : (block.parentFlow ? 100 : block.zIndex),
                      backgroundColor: isFlow ? 'rgba(240, 248, 255, 0.5)' : undefined,
                      transition: 'none',
                      // Более четкая тень и граница для блоков в Flow для лучшей видимости
                      boxShadow: block.parentFlow
                          ? '0 0 8px rgba(59, 130, 246, 0.6), 0 0 0 2px rgba(59, 130, 246, 0.2)'
                          : 'none',
                      // Увеличенная прозрачность для Flow при наведении
                      // Добавляем эффект подсветки при наведении на Flow
                      opacity: hoveredFlow === block.id ? 'var(--flow-hover-opacity, 0.4)' : '1',
                    }}
                    onMouseDown={(e) => {
                      // Не начинаем перетаскивание, если клик был по кнопке удаления
                      if ((e.target as HTMLElement).closest('button')) return;
                      handleDragStart(e, block.id);
                    }}
                >
                  {/* Индикатор для блоков внутри Flow */}
                  {block.parentFlow && (
                      <>
                        <div className="absolute top-0 right-0 bg-blue-500 text-white px-1 text-xs rounded-bl opacity-75">
                          In Flow
                        </div>
                        {/* Визуальный элемент соединения с Flow */}
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white z-20"></div>
                      </>
                  )}

                  {/* Индикатор для блоков внутри Collection */}
                  {inCollection && !isCollection && !isCollectionEnd && (
                      <>
                        <div className="absolute top-0 right-0 bg-pink-500 text-white px-1 text-xs rounded-bl opacity-75">
                          In Collection
                        </div>
                        {/* Визуальный элемент соединения с Collection */}
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1.5 w-3 h-3 rounded-full bg-pink-500 border-2 border-white z-20"></div>
                      </>
                  )}

                  {isFlow ? (
                      // Рендерим контейнер Flow
                      <div className="w-full h-full p-2 relative">
                        {/* Верхний коннектор для Flow */}
                        <div
                            className={`absolute -top-3 left-1/2 transform -translate-x-1/2 w-20 h-3 rounded-t-md bg-cyan-100 border-l-2 border-r-2 border-t-2 border-cyan-300
                        ${connecting && connecting.blockId !== block.id ? 'animate-pulse' : ''}
                        ${connecting && connecting.blockId === block.id && connecting.point === 'top' ? 'bg-blue-100' : ''}
                      `}
                            onClick={() => handleConnectorClick(block.id, 'top')}
                        ></div>

                        <div className="flex justify-between items-center mb-2 bg-blue-100 p-2 rounded shadow-sm">
                          <div className="flex items-center">
                            <Maximize2 size={18} className="mr-2 text-blue-500" />
                            <span className="font-semibold text-blue-800">{block.title}</span>
                          </div>
                          <button
                              className="text-gray-500 hover:text-red-500"
                              onClick={() => removeBlock(block.id)}
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Нижний коннектор для Flow */}
                        <div
                            className={`absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-20 h-3 bg-white border-l-2 border-r-2 border-b-2 border-cyan-300 rounded-b-md
                        ${connecting && connecting.blockId !== block.id ? 'animate-pulse' : ''}
                        ${connecting && connecting.blockId === block.id && connecting.point === 'bottom' ? 'bg-blue-100' : ''}
                      `}
                            onClick={() => handleConnectorClick(block.id, 'bottom')}
                        ></div>
                      </div>
                  ) : (
                      // Рендерим обычный блок
                      <div className="relative">
                        {/* Верхний коннектор (выступ) */}
                        {block.type !== 'Start' && (
                            <div
                                className={`absolute -top-3 left-4 w-20 h-3 rounded-t-md bg-cyan-100 border-l-2 border-r-2 border-t-2 border-cyan-300
                      ${connecting && connecting.blockId !== block.id ? 'animate-pulse' : ''}
                      ${connecting && connecting.blockId === block.id && connecting.point === 'top' ? 'bg-blue-100' : ''}
                    `}
                                onClick={() => (block.type === 'Switch' || block.type === 'Collection') ? handleConnectorClick(block.id, 'top') : null}
                            ></div>
                        )}

                        {/* Основное тело блока */}
                        <div
                            className={`rounded-lg shadow-md ${getBlockColor(block.type)} border-2 border-cyan-300 relative flex`}
                            style={{
                              height: (block.type === 'Collection' || block.type === 'CollectionEnd') ? '40px' : '80px',
                              borderTopLeftRadius: block.type === 'Start' ? '15px' : '0',
                              borderTopRightRadius: '15px',
                              borderBottomLeftRadius: '15px',
                              borderBottomRightRadius:
                                  (block.type === 'End' && !block.title.startsWith('SwitchEnd')) ||
                                  block.type === 'CollectionEnd' ? '15px' : '0',
                            }}
                        >
                          {/* Закругленный левый верхний угол с рисунком */}
                          <div className={`w-16 h-full flex items-center justify-center ${(block.type === 'Collection' || block.type === 'CollectionEnd') ? 'scale-75' : ''}`}>
                            <div className={`${(block.type === 'Collection' || block.type === 'CollectionEnd') ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-gray-600 flex items-center justify-center`}>
                              {block.type === 'Action' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                              {block.type === 'Table' && <div className="w-5 h-3 border border-white"></div>}
                              {block.type === 'Switch' && <ChevronRight size={14} className="text-white" />}
                              {block.type === 'Start' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                              {block.type === 'End' && <div className="w-2 h-2 rounded bg-white"></div>}
                              {block.type === 'Collection' && <Database size={12} className="text-white" />}
                              {block.type === 'CollectionEnd' && <Database size={12} className="text-white" />}
                            </div>
                          </div>

                          {/* Контент блока */}
                          <div className="flex-1 py-2 pr-2 flex flex-col justify-center">
                            {/* Заголовок и кнопка удаления */}
                            <div className="flex justify-between items-center">
                              <span className={`font-semibold text-black ${(block.type === 'Collection' || block.type === 'CollectionEnd') ? 'text-xs' : ''}`}>{block.title}</span>
                              <button
                                  className="text-gray-500 hover:text-red-500"
                                  onClick={() => removeBlock(block.id)}
                              >
                                <X size={(block.type === 'Collection' || block.type === 'CollectionEnd') ? 14 : 16} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Нижний коннектор (выемка) */}
                        {(block.type !== 'End' || block.title.startsWith('SwitchEnd') || block.type === 'CollectionEnd') && (
                            <div className="relative">
                              <div
                                  className={`absolute -bottom-0 rotate-180 left-4 w-20 h-3 bg-white border-l-2 border-r-2 border-b-2 border-cyan-300
                        ${connecting && connecting.blockId !== block.id ? 'animate-pulse' : ''}
                        ${connecting && connecting.blockId === block.id && connecting.point === 'bottom' ? 'bg-blue-100' : ''}
                      `}
                                  style={{ borderBottomLeftRadius: '5px', borderBottomRightRadius: '5px' }}
                                  onClick={() => (block.type === 'Switch' || block.type === 'Collection') ? handleConnectorClick(block.id, 'bottom') : null}
                              ></div>
                            </div>
                        )}
                      </div>
                  )}
                </div>
            );
          })}
        </div>

        <div className="p-2 bg-gray-200 text-xs">
          Blocks: {blocks.length} | Connections: {connections.length}
        </div>
      </div>
  );
};

export default FlowBuilder;