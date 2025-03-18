import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';

// Типы блоков
type BlockType = 'Action' | 'Table' | 'Switch' | 'Start' | 'End' | 'SwitchEnd' | 'SubFlow';

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
  // Свойства для SubFlow блока
  children?: string[]; // ID дочерних блоков
  collapsed?: boolean; // Состояние сворачивания
  originalHeight?: number; // Исходная высота для сохранения при сворачивании
}

// Интерфейс для соединения
interface Connection {
  from: { id: string; point: 'top' | 'bottom' };
  to: { id: string; point: 'top' | 'bottom' };
}

const FlowBuilder = () => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [draggedBlock, setDraggedBlock] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [selectedBlockType, setSelectedBlockType] = useState<BlockType>('Action');
  const [connecting, setConnecting] = useState<{ blockId: string; point: 'top' | 'bottom' } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Отслеживаем счетчик для нумерации Switch блоков
  const [switchCounter, setSwitchCounter] = useState<number>(1);

  // Состояние для отображения/скрытия подсказок
  const [showHints, setShowHints] = useState<boolean>(false);

  // Создание нового блока
  const addBlock = () => {
    const id = `block-${Date.now()}`;
    let title = getBlockTitle(selectedBlockType);

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
      default:
        return 'Block';
    }
  };

  // Удаление блока
  const removeBlock = (id: string) => {
    const blockToRemove = blocks.find(b => b.id === id);
    if (!blockToRemove) return;

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

  // Начало перетаскивания
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    if (!canvasRef.current) return;

    const block = blocks.find(b => b.id === id);
    if (!block) return;

    // Если в данный момент идет процесс соединения от Switch, то при клике на блок
    // нужно попытаться соединить Switch с этим блоком
    if (connecting && connecting.blockId !== id && connecting.point === 'bottom') {
      const sourceBlock = blocks.find(b => b.id === connecting.blockId);

      if (sourceBlock && sourceBlock.type === 'Switch' && block.type !== 'Start') {
        // Соединяем Switch с выбранным блоком
        // Проверяем, что у целевого блока нет соединения сверху
        if (block.connections.top === null) {
          // Обновляем соединения в блоках
          setBlocks(blocks.map(b => {
            if (b.id === sourceBlock.id) {
              // Обновляем Source блок (Switch)
              return {
                ...b,
                connections: {
                  ...b.connections,
                  bottom: [...b.connections.bottom, block.id]
                }
              };
            } else if (b.id === block.id) {
              // Обновляем Target блок
              return {
                ...b,
                connections: {
                  ...b.connections,
                  top: sourceBlock.id
                }
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
        }

        setConnecting(null);
        return;
      }
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - block.position.x;
    const offsetY = e.clientY - rect.top - block.position.y;

    setDraggedBlock({ id, offsetX, offsetY });
  };

  // Получение всех блоков, подключенных ниже указанного блока
  const getConnectedBlocksBelow = (blockId: string, visited: Set<string> = new Set()): string[] => {
    if (visited.has(blockId)) return [];

    visited.add(blockId);
    const block = blocks.find(b => b.id === blockId);

    if (!block) return [];

    const connectedIds: string[] = [];

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

    return connectedIds;
  };

  // Перетаскивание
  const handleDrag = (e: MouseEvent) => {
    if (!draggedBlock || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const currentBlock = blocks.find(b => b.id === draggedBlock.id);
    if (!currentBlock) return;

    // Текущая позиция блока до перемещения
    const oldX = currentBlock.position.x;
    const oldY = currentBlock.position.y;

    // Новая позиция блока
    const newX = e.clientX - rect.left - draggedBlock.offsetX;
    const newY = e.clientY - rect.top - draggedBlock.offsetY;

    // Смещение
    const deltaX = newX - oldX;
    const deltaY = newY - oldY;

    // Обновляем позицию блоков
    let updatedBlocks = [...blocks];

    // Если перетаскиваемый блок имеет соединение сверху, проверяем, не нужно ли его отсоединить
    const hasTopConnection = currentBlock.connections.top !== null;

    // Уменьшаем порог отсоединения для более чёткого разъединения блоков
    // Используем вертикальное расстояние для определения отсоединения
    const disconnectThreshold = 15; // Порог расстояния для отсоединения блока (уменьшен для более быстрого отсоединения)

    // Если блок имеет соединение сверху (и это не связка Switch-SwitchEnd)
    if (hasTopConnection) {
      const parentBlockId = currentBlock.connections.top;
      const parentBlock = updatedBlocks.find(b => b.id === parentBlockId);

      if (parentBlock) {
        // Не отсоединяем SwitchEnd от его Switch
        const isSwitchEndPair = parentBlock.title.startsWith('Switch') && currentBlock.title.startsWith('SwitchEnd');

        if (!isSwitchEndPair) {
          // Проверяем вертикальное расстояние между соединёнными блоками
          const parentBottom = parentBlock.position.y + 80; // Нижняя точка родительского блока
          const childTop = newY; // Верхняя точка дочернего блока (новая позиция)
          const verticalDistance = Math.abs(parentBottom - childTop);

          // Также проверяем горизонтальное смещение
          const parentCenterX = parentBlock.position.x + 100; // Центр родительского блока
          const childCenterX = newX + 100; // Центр дочернего блока (новая позиция)
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
          }
        }
      }
    }

    // Получаем список всех блоков, которые нужно сместить
    const connectedBlocks = getConnectedBlocksBelow(draggedBlock.id);

    // Обновляем позиции текущего и связанных блоков
    updatedBlocks = updatedBlocks.map(block => {
      if (block.id === draggedBlock.id) {
        return { ...block, position: { x: newX, y: newY } };
      } else if (connectedBlocks.includes(block.id)) {
        // Перемещаем все связанные блоки на то же смещение
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

    setBlocks(updatedBlocks);
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

    // Только при отпускании проверяем возможность соединения
    if (!connecting && !currentBlock.title.startsWith('SwitchEnd')) {
      const currentX = currentBlock.position.x;
      const currentY = currentBlock.position.y;
      const currentCenterX = currentX + 100; // Центр блока по X (учитываем ширину 200px)

      // 1. Проверяем верхний коннектор текущего блока (подключение снизу вверх)
      if (currentBlock.type !== 'Start' && currentBlock.connections.top === null) {
        // Позиция верхнего коннектора текущего блока
        const currentTopY = currentY;

        for (const targetBlock of blocks) {
          // Пропускаем себя и блоки End без нижнего коннектора
          if (targetBlock.id === currentBlock.id ||
              (targetBlock.type === 'End' && !targetBlock.title.startsWith('SwitchEnd'))) continue;

          // Пропускаем блоки, у которых уже есть соединение снизу (кроме Switch)
          if (targetBlock.type !== 'Switch' && targetBlock.connections.bottom.length > 0) continue;

          // Позиция нижнего коннектора целевого блока
          const targetBottomY = targetBlock.position.y + 80;
          const targetCenterX = targetBlock.position.x + 100; // Центр блока (учитываем ширину 200px)

          // Проверка на близость коннекторов - увеличиваем область для лучшего притяжения
          const verticalDistance = Math.abs(currentTopY - targetBottomY);
          const horizontalDistance = Math.abs(currentCenterX - targetCenterX);

          // Увеличиваем расстояние снэпа для лучшего притяжения
          if (verticalDistance < 30 && horizontalDistance < 40) {
            // Сначала обновляем текущий блок и его связь
            const newPositionY = targetBlock.position.y + 83; // Высота блока + точный отступ
            const newPositionX = targetBlock.position.x; // Точно по центру целевого блока

            // Вычисляем смещение от текущей позиции
            const deltaX = newPositionX - currentBlock.position.x;
            const deltaY = newPositionY - currentBlock.position.y;

            // Получаем все блоки, подключенные снизу
            const connectedBlocks = getConnectedBlocksBelow(currentBlock.id);

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
                  }
                };
              } else if (connectedBlocks.includes(block.id)) {
                // Обновляем все связанные блоки снизу на то же смещение
                return {
                  ...block,
                  position: {
                    x: block.position.x + deltaX,
                    y: block.position.y + deltaY
                  }
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

          // Проверяем, есть ли у текущего блока уже соединение снизу (кроме Switch)
          if (currentBlock.type !== 'Switch' && currentBlock.connections.bottom.length > 0) continue;

          // Позиция верхнего коннектора целевого блока
          const targetTopY = targetBlock.position.y;
          const targetCenterX = targetBlock.position.x + 100; // Центр блока (учитываем ширину 200px)

          // Проверка на близость коннекторов - увеличиваем область для лучшего притяжения
          const verticalDistance = Math.abs(currentBottomY - targetTopY);
          const horizontalDistance = Math.abs(currentCenterX - targetCenterX);

          // Увеличиваем расстояние снэпа для лучшего притяжения
          if (verticalDistance < 30 && horizontalDistance < 40) {
            // Расчет новой позиции для целевого блока
            const newTargetX = currentBlock.position.x;
            const newTargetY = currentBlock.position.y + 83;

            // Вычисляем смещение для целевого блока
            const deltaX = newTargetX - targetBlock.position.x;
            const deltaY = newTargetY - targetBlock.position.y;

            // Получаем все блоки, подключенные снизу целевого блока
            const connectedBlocks = getConnectedBlocksBelow(targetBlock.id);

            // Обновляем все блоки: целевой и все связанные с ним снизу
            updatedBlocks = updatedBlocks.map(block => {
              if (block.id === targetBlock.id) {
                // Обновляем целевой блок
                return {
                  ...block,
                  position: { x: newTargetX, y: newTargetY },
                  connections: {
                    ...block.connections,
                    top: currentBlock.id
                  }
                };
              } else if (connectedBlocks.includes(block.id)) {
                // Обновляем все связанные блоки снизу целевого на то же смещение
                return {
                  ...block,
                  position: {
                    x: block.position.x + deltaX,
                    y: block.position.y + deltaY
                  }
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

            break;
          }
        }
      }
    }

    setBlocks(updatedBlocks);
    setConnections(updatedConnections);
    setDraggedBlock(null);
  };

  // Начало соединения
  const handleConnectorClick = (blockId: string, point: 'top' | 'bottom') => {
    // Проверяем, это блок Switch
    const block = blocks.find(b => b.id === blockId);
    if (!block || block.type !== 'Switch') return;

    if (connecting) {
      // Если мы уже начали соединение, завершаем его
      if (connecting.blockId === blockId) {
        // Мы выбрали тот же блок Switch, отменяем выбор
        setConnecting(null);
        return;
      }

      // Проверяем, если у нас уже выбран коннектор Switch, и мы кликаем по другому блоку
      const targetBlock = blocks.find(b => b.id === blockId);
      const sourceBlock = blocks.find(b => b.id === connecting.blockId);

      if (sourceBlock && sourceBlock.type === 'Switch' && connecting.point === 'bottom' && targetBlock) {
        // Соединяем Switch с выбранным блоком
        // Для Switch соединение должно идти от нижнего коннектора Switch к верхнему коннектору целевого блока

        // Проверяем, что у целевого блока нет соединения сверху
        if (targetBlock.connections.top === null) {
          // Обновляем соединения в блоках
          setBlocks(blocks.map(block => {
            if (block.id === sourceBlock.id) {
              // Обновляем Source блок (Switch)
              return {
                ...block,
                connections: {
                  ...block.connections,
                  bottom: [...block.connections.bottom, targetBlock.id]
                }
              };
            } else if (block.id === targetBlock.id) {
              // Обновляем Target блок
              return {
                ...block,
                connections: {
                  ...block.connections,
                  top: sourceBlock.id
                }
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
        }

        setConnecting(null);
      }
    } else {
      // Начинаем новое соединение со Switch
      if (point === 'bottom') {
        setConnecting({ blockId, point });
      }
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
    const x = block.position.x + 50; // середина блока по горизонтали
    const y = point === 'top'
        ? block.position.y
        : block.position.y + 80; // верх или низ блока

    return { x, y };
  };

  // Отрисовка соединений
  const renderConnections = () => {
    return connections.map((conn, index) => {
      const fromBlock = blocks.find(b => b.id === conn.from.id);
      const toBlock = blocks.find(b => b.id === conn.to.id);

      if (!fromBlock || !toBlock) return null;

      // Отображаем соединения только для блоков Switch (но не для связи Switch и SwitchEnd)
      if (fromBlock.type === 'Switch' && !toBlock.title.startsWith('SwitchEnd')) {
        const fromCoord = getConnectorCoordinates(fromBlock, conn.from.point);
        const toCoord = getConnectorCoordinates(toBlock, conn.to.point);

        // Вычисляем середину для создания плавной кривой
        const midY = (fromCoord.y + toCoord.y) / 2;

        const pathData = `
          M ${fromCoord.x} ${fromCoord.y}
          C ${fromCoord.x} ${midY}, ${toCoord.x} ${midY}, ${toCoord.x} ${toCoord.y}
        `;

        return (
            <path
                key={`conn-${index}`}
                d={pathData}
                stroke="#333"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
            />
        );
      }

      return null; // Для других блоков не отображаем линии соединений
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
      case 'SubFlow':
        return 'bg-blue-100 border-blue-300';
      default:
        return 'bg-gray-100 border-gray-200';
    }
  };

  return (
      <div className="flex flex-col h-screen bg-gray-100">
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
              <option value="SubFlow">SubFlow</option>
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
                <p>• SwitchEnd can have connections below it</p>
                <p>• For Switch block: click on the <strong>bottom connector</strong> of Switch (it will turn blue), then click on <strong>any block</strong> you want to connect</p>
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

          {blocks.map((block) => (
              <div
                  key={block.id}
                  className="absolute cursor-move"
                  style={{
                    left: `${block.position.x}px`,
                    top: `${block.position.y}px`,
                    width: '200px',
                    height: '80px',
                  }}
                  onMouseDown={(e) => {
                    // Не начинаем перетаскивание, если клик был по кнопке удаления
                    if ((e.target as HTMLElement).closest('button')) return;
                    handleDragStart(e, block.id);
                  }}
              >
                {/* Новый дизайн блока в стиле скриншота */}
                <div className="relative">
                  {/* Верхний коннектор (выступ) */}
                  {block.type !== 'Start' && (
                      <div
                          className={`absolute -top-3 left-4 w-20 h-3 rounded-t-md bg-cyan-100 border-l-2 border-r-2 border-t-2 border-cyan-300
                    ${connecting && connecting.blockId !== block.id ? 'animate-pulse' : ''}
                    ${connecting && connecting.blockId === block.id && connecting.point === 'top' ? 'bg-blue-100' : ''}
                  `}
                          onClick={() => block.type === 'Switch' ? handleConnectorClick(block.id, 'top') : null}
                      ></div>
                  )}

                  {/* Основное тело блока */}
                  <div
                      className={`rounded-lg shadow-md ${getBlockColor(block.type)} border-2 border-cyan-300 h-20 relative flex`}
                      style={{
                        borderTopLeftRadius: block.type === 'Start' ? '15px' : '0',
                        borderTopRightRadius: '15px',
                        borderBottomLeftRadius: '15px',
                        borderBottomRightRadius: block.type === 'End' && !block.title.startsWith('SwitchEnd') ? '15px' : '0',
                      }}
                  >
                    {/* Закругленный левый верхний угол с рисунком */}
                    <div className="w-16 h-full flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                        {block.type === 'Action' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                        {block.type === 'Table' && <div className="w-5 h-3 border border-white"></div>}
                        {block.type === 'Switch' && <ChevronRight size={14} className="text-white" />}
                        {block.type === 'Start' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                        {block.type === 'End' && <div className="w-2 h-2 rounded bg-white"></div>}
                      </div>
                    </div>

                    {/* Контент блока */}
                    <div className="flex-1 py-2 pr-2 flex flex-col justify-center">
                      {/* Заголовок и кнопка удаления */}
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-black">{block.title}</span>
                        <button
                            className="text-gray-500 hover:text-red-500"
                            onClick={() => removeBlock(block.id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Нижний коннектор (выемка) */}
                  {(block.type !== 'End' || block.title.startsWith('SwitchEnd')) && (
                      <div className="relative">
                        <div
                            className={`absolute -bottom-3 left-4 w-20 h-3 bg-white border-l-2 border-r-2 border-b-2 border-cyan-300
                      ${connecting && connecting.blockId !== block.id ? 'animate-pulse' : ''}
                      ${connecting && connecting.blockId === block.id && connecting.point === 'bottom' ? 'bg-blue-100' : ''}
                    `}
                            style={{ borderBottomLeftRadius: '5px', borderBottomRightRadius: '5px' }}
                            onClick={() => block.type === 'Switch' ? handleConnectorClick(block.id, 'bottom') : null}
                        ></div>
                      </div>
                  )}
                </div>
              </div>
          ))}
        </div>

        <div className="p-2 bg-gray-200 text-xs">
          Blocks: {blocks.length} | Connections: {connections.length}
        </div>
      </div>
  );
};

export default FlowBuilder;