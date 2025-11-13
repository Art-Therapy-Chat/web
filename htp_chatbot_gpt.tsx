import React, { useState, useRef, useEffect } from 'react';
import { Upload, MessageCircle, Eraser } from 'lucide-react';

const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY ?? '';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const HTPChatbot: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'house' | 'tree' | 'person'>('house');
  const [drawings, setDrawings] = useState<{
    house: string | null;
    tree: string | null;
    person: string | null;
  }>({
    house: null,
    tree: null,
    person: null,
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [interpretation, setInterpretation] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [brushSize, setBrushSize] = useState(2);
  const [brushColor, setBrushColor] = useState('#000000');

  // 최종 해석 이후 정정/질문 여부
  const [needsCorrection, setNeedsCorrection] = useState(false);
  const [finalInterpretation, setFinalInterpretation] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  const tabNames = {
    house: { ko: '집', en: 'House' },
    tree: { ko: '나무', en: 'Tree' },
    person: { ko: '사람', en: 'Person' },
  } as const;

  // 캔버스 초기화 & 탭 전환 시 그림 로드
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = brushColor;
    setContext(ctx);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentDataUrl = drawings[activeTab];
    if (currentDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = currentDataUrl;
    }
  }, [activeTab, brushSize, brushColor, drawings, drawings[activeTab]]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (!context) return;
    setIsDrawing(true);
    const coords = getCoordinates(e);
    context.beginPath();
    context.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (!isDrawing || !context) return;
    const coords = getCoordinates(e);
    context.lineTo(coords.x, coords.y);
    context.stroke();
  };

  const stopDrawing = () => {
    if (!context) return;
    setIsDrawing(false);
    context.closePath();
    saveCurrentDrawing();
  };

  const saveCurrentDrawing = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL(); // data:image/png;base64,....
    setDrawings(prev => ({
      ...prev,
      [activeTab]: dataUrl,
    }));
  };

  const clearCanvas = () => {
    if (!context || !canvasRef.current) return;
    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setDrawings(prev => ({
      ...prev,
      [activeTab]: null,
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        if (!context || !canvasRef.current) return;
        const canvas = canvasRef.current;
        context.clearRect(0, 0, canvas.width, canvas.height);

        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        context.drawImage(img, x, y, img.width * scale, img.height * scale);
        saveCurrentDrawing();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const hasAnyDrawing = () => {
    return Boolean(drawings.house || drawings.tree || drawings.person);
  };

  // OpenAI vision용 이미지 content 생성 (chat/completions 형식)
  const buildImageContents = () => {
    const contents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];

    if (drawings.house) {
      contents.push({
        type: 'image_url',
        image_url: { url: drawings.house }, // 이미 dataURL 형태
      });
    }
    if (drawings.tree) {
      contents.push({
        type: 'image_url',
        image_url: { url: drawings.tree },
      });
    }
    if (drawings.person) {
      contents.push({
        type: 'image_url',
        image_url: { url: drawings.person },
      });
    }
    return contents;
  };

  const buildDescriptions = () => {
    const descriptions: string[] = [];
    if (drawings.house) descriptions.push('집 그림');
    if (drawings.tree) descriptions.push('나무 그림');
    if (drawings.person) descriptions.push('사람 그림');
    return descriptions;
  };

  // ✅ 1단계: 첫 질문 생성
  const getInterpretation = async () => {
    if (!OPENAI_API_KEY) {
      alert('OPENAI_API_KEY가 설정되지 않았습니다.');
      return;
    }

    setIsLoading(true);

    const imageContents = buildImageContents();
    const descriptions = buildDescriptions();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: [
                ...imageContents,
                {
                  type: 'text',
                  text: `당신은 전문 심리상담사입니다. HTP(House-Tree-Person) 검사를 진행하고 있습니다.

제공된 그림: ${descriptions.join(', ')}

그림을 분석하여 더 정확한 해석을 위해 필요한 추가 정보 1가지만 질문해주세요.

먼저 검사자의 기본 정보(나이, 성별 등)를 물어보고, 그 다음 그림에 대한 구체적인 질문을 해주세요.
HTP 검사는 연령대, 성별, 생활 환경에 따라 해석이 달라질 수 있습니다.

질문은 구체적이고 명확하게, 친근한 말투로 해주세요.

예시 질문:
- "먼저, 나이와 성별을 알려주실 수 있을까요?"
- "이 집에는 몇 명이 살고 있나요?"
- "나무의 나이는 몇 살 정도로 느껴지시나요?"
- "그린 사람은 무엇을 하고 있는 중인가요?"

질문만 작성해주세요.`,
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      const question = data.choices?.[0]?.message?.content ?? '질문 생성에 실패했습니다. 다시 시도해주세요.';

      setMessages([{ role: 'assistant', content: question }]);
      setQuestionCount(1);
    } catch (error) {
      console.error(error);
      setMessages([{ role: 'assistant', content: '질문을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.' }]);
    }

    setIsLoading(false);
    setCurrentPage(2);
  };

  // ✅ 2단계: 질문-답변 진행 (최종 해석 전)
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || isComplete) return;
    if (!OPENAI_API_KEY) {
      alert('OPENAI_API_KEY가 설정되지 않았습니다.');
      return;
    }

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');
    setIsLoading(true);

    const conversationHistory = [
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const imageContents = buildImageContents();
    const newQuestionCount = questionCount + 1;
    const shouldFinalize = newQuestionCount >= 5;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: [
                ...imageContents,
                {
                  type: 'text',
                  text: `당신은 전문 심리상담사입니다. HTP 검사를 진행 중입니다.

지금까지의 대화:
${conversationHistory
  .map(msg => `${msg.role === 'user' ? '사용자' : '상담사'}: ${msg.content}`)
  .join('\n')}

${
  shouldFinalize
    ? `이제 충분한 정보를 얻었습니다. 그림과 대화 내용을 종합하여 최종 HTP 검사 해석을 제공해주세요.

중요: 검사자의 나이, 성별, 생활 환경을 고려하여 해석해주세요. HTP 검사는 연령대와 발달 단계에 따라 같은 그림도 다르게 해석됩니다.

다음을 포함해주세요:
1. 그림에서 관찰되는 주요 특징들
2. 검사자의 배경(나이, 성별, 환경)을 고려한 해석
3. 추가 질문으로 얻은 정보의 의미
4. 종합적인 심리 상태 해석
5. 긍정적인 측면과 발전 방향 제시

따뜻하고 공감적인 말투로 4-5문단 정도로 작성해주세요.

해석을 마친 후, 마지막에 반드시 다음 질문을 추가해주세요:
"제가 그림을 잘못 이해한 부분이 있나요? 있다면 알려주세요!"`
    : `사용자의 답변을 바탕으로 추가 질문 1개를 해주세요.
${
  newQuestionCount <= 2
    ? '아직 기본 정보(나이, 성별, 생활환경 등)를 충분히 수집하지 못했다면 이를 먼저 물어보세요.'
    : ''
}
질문은 그림 해석에 도움이 되는 구체적인 내용이어야 합니다.
친근하고 자연스러운 대화 형식으로 질문해주세요.

질문만 간단히 작성해주세요.`
}
`,
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      const assistantMessage: string = data.choices?.[0]?.message?.content ?? '응답 생성에 실패했습니다. 다시 시도해주세요.';

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
      setQuestionCount(newQuestionCount);

      if (shouldFinalize) {
        setInterpretation(assistantMessage);
        setFinalInterpretation(assistantMessage);
        setIsComplete(true);
        setNeedsCorrection(true);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '응답을 가져오는 중 오류가 발생했습니다. 다시 시도해주세요.',
        },
      ]);
    }

    setIsLoading(false);
  };

  // ✅ 3단계: 최종 해석 이후 follow-up 질문/정정
  const sendFollowUpMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    if (!OPENAI_API_KEY) {
      alert('OPENAI_API_KEY가 설정되지 않았습니다.');
      return;
    }

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');
    setIsLoading(true);

    const conversationHistory = [
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const imageContents = buildImageContents();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: [
                ...imageContents,
                {
                  type: 'text',
                  text: `당신은 전문 심리상담사입니다. HTP 검사의 최종 해석을 완료했습니다.

지금까지의 대화:
${conversationHistory
  .map(msg => `${msg.role === 'user' ? '사용자' : '상담사'}: ${msg.content}`)
  .join('\n')}

${
  needsCorrection
    ? `사용자가 그림에 대한 정정이나 수정 사항을 제시했습니다. 
이를 반영하여 최종 해석을 수정해주세요. 수정된 전체 해석을 다시 제공해주세요.

수정 후 다음 질문을 추가해주세요:
"추가로 수정할 부분이 있나요? 없으시다면 해석에 대해 궁금한 점을 자유롭게 물어보세요!"`
    : `사용자의 질문에 친근하고 전문적으로 답변해주세요.
HTP 검사 해석과 관련된 내용을 따뜻하게 설명해주세요.`
}
`,
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      const assistantMessage: string = data.choices?.[0]?.message?.content ?? '응답 생성에 실패했습니다. 다시 시도해주세요.';

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);

      if (needsCorrection) {
        setInterpretation(assistantMessage);
        setFinalInterpretation(assistantMessage);
        setNeedsCorrection(false);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '응답을 가져오는 중 오류가 발생했습니다. 다시 시도해주세요.',
        },
      ]);
    }

    setIsLoading(false);
  };

  // ✅ 페이지 1: 그림 입력 화면
  if (currentPage === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-purple-600 mb-2">챗쪽이</h1>
            <h2 className="text-2xl text-gray-700">HTP 심리 검사 해석 챗봇</h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex gap-2 mb-6">
              {(['house', 'tree', 'person'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    saveCurrentDrawing();
                    setActiveTab(tab);
                  }}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <span>{tabNames[tab].ko}</span>
                    <span className="text-xs opacity-75">{tabNames[tab].en}</span>
                  </div>
                  {drawings[tab] && <span className="ml-2 text-xs">✓</span>}
                </button>
              ))}
            </div>

            <div className="mb-4 flex gap-4 items-center bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">브러쉬 크기:</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-gray-600 w-8">{brushSize}px</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">색상:</label>
                <input
                  type="color"
                  value={brushColor}
                  onChange={e => setBrushColor(e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="mb-4">
              <canvas
                ref={canvasRef}
                width={700}
                height={500}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="border-2 border-gray-300 rounded-lg w-full cursor-crosshair bg-white"
              />
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={clearCanvas}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <Eraser size={20} />
                지우기
              </button>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer">
                <Upload size={20} />
                이미지 업로드
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={getInterpretation}
              disabled={!hasAnyDrawing() || isLoading}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                hasAnyDrawing() && !isLoading
                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? '분석 중...' : '다음'}
            </button>

            {!hasAnyDrawing() && (
              <p className="text-center text-red-500 text-sm mt-2">
                최소 한 가지 그림을 그리거나 업로드해주세요
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ✅ 페이지 2: 대화 + 결과 화면
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-purple-600 mb-2">검사 결과</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {(['house', 'tree', 'person'] as const).map(type => (
              <div key={type} className="text-center">
                <div className="mb-2">
                  <p className="font-semibold text-gray-800">{tabNames[type].ko}</p>
                  <p className="text-xs text-gray-500">{tabNames[type].en}</p>
                </div>
                <div className="border-2 border-gray-200 rounded-lg p-2 bg-gray-50 h-48 flex items-center justify-center">
                  {drawings[type] ? (
                    <img
                      src={drawings[type] as string}
                      alt={tabNames[type].ko}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-gray-400 text-sm">그림 없음</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="prose max-w-none">
            <h3 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
              <MessageCircle className="text-purple-600" />
              {isComplete ? '최종 HTP 검사 해석' : '초기 관찰'}
            </h3>
            {interpretation && (
              <div className="bg-purple-50 rounded-lg p-4 whitespace-pre-wrap">
                {interpretation}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            {isComplete ? '최종 검사 결과' : '추가 정보 수집'}
          </h3>

          <div className="h-96 overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-lg">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                  <p className="text-gray-500">
                    {questionCount >= 3 ? '최종 해석 생성 중...' : '질문 생성 중...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isComplete && (
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendMessage()}
                placeholder="답변을 입력해주세요..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                전송
              </button>
            </div>
          )}

          {isComplete && (
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendFollowUpMessage()}
                placeholder={
                  needsCorrection ? '잘못 이해한 부분을 알려주세요...' : '궁금한 점을 물어보세요...'
                }
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                disabled={isLoading}
              />
              <button
                onClick={sendFollowUpMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                전송
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setCurrentPage(1);
            setMessages([]);
            setInterpretation('');
            setQuestionCount(0);
            setIsComplete(false);
            setNeedsCorrection(false);
            setFinalInterpretation('');
            setDrawings({
              house: null,
              tree: null,
              person: null,
            });
            if (context && canvasRef.current) {
              context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }}
          className="mt-6 w-full py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          처음으로 돌아가기
        </button>
      </div>
    </div>
  );
};

export default HTPChatbot;
